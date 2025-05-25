#!/usr/bin/env node

/**
 * Migration script to add IDs to existing Observation nodes
 * Run this script after updating to version with Observation IDs
 */

import neo4j from 'neo4j-driver';
import { generateCompactId } from '../dist/id_generator.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const username = process.env.NEO4J_USERNAME || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'password';

const driver = neo4j.driver(uri, neo4j.auth.basic(username, password));

async function migrate() {
  const session = driver.session();
  
  try {
    console.log('Starting migration: Adding IDs to Observation nodes...');
    
    // Count observations without IDs
    const countResult = await session.run(`
      MATCH (o:Observation)
      WHERE o.id IS NULL
      RETURN count(o) as count
    `);
    
    const totalCount = countResult.records[0].get('count').toNumber();
    console.log(`Found ${totalCount} observations without IDs`);
    
    if (totalCount === 0) {
      console.log('No observations need migration');
      return;
    }
    
    // Process in batches
    const batchSize = 1000;
    let processed = 0;
    
    while (processed < totalCount) {
      const tx = session.beginTransaction();
      
      try {
        // Get batch of observations without IDs
        const batchResult = await tx.run(`
          MATCH (o:Observation)
          WHERE o.id IS NULL
          RETURN id(o) as nodeId
          LIMIT $batchSize
        `, { batchSize });
        
        // Update each observation with a new ID
        for (const record of batchResult.records) {
          const nodeId = record.get('nodeId');
          const newId = generateCompactId();
          
          await tx.run(`
            MATCH (o:Observation)
            WHERE id(o) = $nodeId
            SET o.id = $newId
          `, { nodeId, newId });
        }
        
        await tx.commit();
        processed += batchResult.records.length;
        console.log(`Processed ${processed}/${totalCount} observations`);
        
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    }
    
    console.log('Migration completed successfully!');
    
    // Verify migration
    const verifyResult = await session.run(`
      MATCH (o:Observation)
      WHERE o.id IS NULL
      RETURN count(o) as count
    `);
    
    const remaining = verifyResult.records[0].get('count').toNumber();
    if (remaining > 0) {
      console.warn(`Warning: ${remaining} observations still without IDs`);
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run migration
migrate().catch(console.error);
