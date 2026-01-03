/**
 * Migration Script: Add human-readable fields to existing Firestore documents
 * 
 * This script adds:
 * - goalTitle and userName to checkIns
 * - userName to goals
 * - monthDisplay and assignedUserName to monthlyWagers
 * 
 * SETUP:
 * 1. Install firebase-admin: npm install firebase-admin
 * 2. Download your service account key from Firebase Console:
 *    - Go to Project Settings > Service Accounts
 *    - Click "Generate New Private Key"
 *    - Save the file as "service-account-key.json" in the project root
 *    - Add "service-account-key.json" to your .gitignore!
 * 
 * RUN:
 *   npx ts-node --skip-project scripts/migrate-readable-fields.ts
 * 
 * Or if ts-node doesn't work:
 *   npx tsx scripts/migrate-readable-fields.ts
 */

// @ts-ignore - firebase-admin types
import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', 'service-account-key.json');

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const serviceAccount = require(serviceAccountPath);
  
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
} catch (e) {
  console.error('❌ Could not load service account key.');
  console.error('');
  console.error('Please download your service account key from Firebase Console:');
  console.error('1. Go to https://console.firebase.google.com/');
  console.error('2. Select your project');
  console.error('3. Go to Project Settings (gear icon) > Service Accounts');
  console.error('4. Click "Generate New Private Key"');
  console.error('5. Save the file as "service-account-key.json" in the project root');
  console.error('6. Make sure "service-account-key.json" is in your .gitignore!');
  process.exit(1);
}

const db = admin.firestore();

interface User {
  uid: string;
  displayName: string;
}

interface Goal {
  id: string;
  userId: string;
  title: string;
}

async function migrate() {
  console.log('🚀 Starting migration...\n');

  // First, build lookup maps for users and goals
  console.log('📋 Building user lookup map...');
  const usersMap = new Map<string, User>();
  const usersSnapshot = await db.collection('users').get();
  usersSnapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
    const data = doc.data();
    usersMap.set(doc.id, {
      uid: doc.id,
      displayName: data.displayName || 'Unknown',
    });
  });
  console.log(`   Found ${usersMap.size} users\n`);

  console.log('📋 Building goals lookup map...');
  const goalsMap = new Map<string, Goal>();
  const goalsSnapshot = await db.collection('goals').get();
  goalsSnapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
    const data = doc.data();
    goalsMap.set(doc.id, {
      id: doc.id,
      userId: data.userId,
      title: data.title || 'Unknown Goal',
    });
  });
  console.log(`   Found ${goalsMap.size} goals\n`);

  // Migrate Goals - add userName
  console.log('📝 Migrating Goals...');
  let goalsUpdated = 0;
  let goalsSkipped = 0;
  
  for (const doc of goalsSnapshot.docs) {
    const data = doc.data();
    
    // Skip if already has userName
    if (data.userName) {
      goalsSkipped++;
      continue;
    }

    const user = usersMap.get(data.userId);
    if (user) {
      await db.collection('goals').doc(doc.id).update({
        userName: user.displayName,
      });
      goalsUpdated++;
      console.log(`   ✓ Updated goal "${data.title}" → userName: ${user.displayName}`);
    }
  }
  console.log(`   Goals: ${goalsUpdated} updated, ${goalsSkipped} skipped\n`);

  // Migrate Check-ins - add goalTitle and userName
  console.log('📝 Migrating Check-ins...');
  let checkInsUpdated = 0;
  let checkInsSkipped = 0;
  
  const checkInsSnapshot = await db.collection('checkIns').get();
  console.log(`   Found ${checkInsSnapshot.size} check-ins to process...`);
  
  for (const doc of checkInsSnapshot.docs) {
    const data = doc.data();
    
    // Skip if already has both fields
    if (data.goalTitle && data.userName) {
      checkInsSkipped++;
      continue;
    }

    const updates: Record<string, string> = {};
    
    if (!data.goalTitle) {
      const goal = goalsMap.get(data.goalId);
      if (goal) {
        updates.goalTitle = goal.title;
      }
    }
    
    if (!data.userName) {
      const user = usersMap.get(data.userId);
      if (user) {
        updates.userName = user.displayName;
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.collection('checkIns').doc(doc.id).update(updates);
      checkInsUpdated++;
      if (checkInsUpdated % 50 === 0) {
        console.log(`   Processed ${checkInsUpdated} check-ins...`);
      }
    }
  }
  console.log(`   Check-ins: ${checkInsUpdated} updated, ${checkInsSkipped} skipped\n`);

  // Migrate Monthly Wagers - add monthDisplay and assignedUserName
  console.log('📝 Migrating Monthly Wagers...');
  let wagersUpdated = 0;
  let wagersSkipped = 0;
  
  const wagersSnapshot = await db.collection('monthlyWagers').get();
  console.log(`   Found ${wagersSnapshot.size} monthly wagers to process...`);
  
  for (const doc of wagersSnapshot.docs) {
    const data = doc.data();
    
    // Skip if already has both fields
    if (data.monthDisplay && data.assignedUserName) {
      wagersSkipped++;
      continue;
    }

    const updates: Record<string, string> = {};
    
    if (!data.monthDisplay && data.month) {
      // Parse YYYY-MM format
      const [year, monthNum] = data.month.split('-').map(Number);
      const date = new Date(year, monthNum - 1, 1);
      updates.monthDisplay = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    
    if (!data.assignedUserName) {
      const user = usersMap.get(data.assignedUserId);
      if (user) {
        updates.assignedUserName = user.displayName;
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.collection('monthlyWagers').doc(doc.id).update(updates);
      wagersUpdated++;
      console.log(`   ✓ Updated wager for ${data.month}`);
    }
  }
  console.log(`   Monthly Wagers: ${wagersUpdated} updated, ${wagersSkipped} skipped\n`);

  console.log('═══════════════════════════════════════');
  console.log('✅ Migration Complete!');
  console.log('═══════════════════════════════════════');
  console.log(`   Goals updated:         ${goalsUpdated}`);
  console.log(`   Check-ins updated:     ${checkInsUpdated}`);
  console.log(`   Monthly Wagers updated: ${wagersUpdated}`);
}

// Run the migration
migrate()
  .then(() => {
    console.log('\n👋 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
