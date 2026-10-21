/**
 * Grants a Firebase Auth user access to the app (firestore.rules only allow /members/{uid}).
 * The person must sign in to the app once first (email or Google) so the account exists.
 *
 *   npm run add-member -- someone@gmail.com
 */
import dotenv from 'dotenv';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb, getFirebaseApp } from '../config/firebase';
import { COLLECTIONS } from '../constants/firestore';

dotenv.config();

async function main() {
  const email = process.argv[2];
  if (!email) {
    throw new Error('Usage: npm run add-member -- <email>');
  }

  const user = await getAuth(getFirebaseApp()).getUserByEmail(email);
  await getDb().collection(COLLECTIONS.members).doc(user.uid).set({
    email,
    addedAt: FieldValue.serverTimestamp(),
  });
  console.log(`✅ ${email} (${user.uid}) can now use the app`);
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
