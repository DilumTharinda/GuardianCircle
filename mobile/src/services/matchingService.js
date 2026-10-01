import {
  collection,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebase';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'was', 'in', 'on', 'at', 'and', 'or',
  'with', 'for', 'of', 'to', 'my', 'it', 'this', 'that', 'near',
  'found', 'lost',
]);

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// Compares the meaningful words in two descriptions.
// Returns a score from 0 (no overlap) to 1 (identical word sets).
function descriptionSimilarity(descA, descB) {
  const wordsA = new Set(tokenize(descA));
  const wordsB = new Set(tokenize(descB));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let common = 0;
  wordsA.forEach((word) => {
    if (wordsB.has(word)) common += 1;
  });

  return common / Math.max(wordsA.size, wordsB.size);
}

// Compares how many leading geohash characters match.
// Geohashes share more leading characters the closer two points are.
// Returns a score from 0 (far apart) to 1 (very close, 5+ matching chars).
function geohashProximityScore(geohashA, geohashB) {
  if (!geohashA || !geohashB) return 0;

  let matchingChars = 0;
  const maxLen = Math.min(geohashA.length, geohashB.length);
  for (let i = 0; i < maxLen; i++) {
    if (geohashA[i] === geohashB[i]) {
      matchingChars += 1;
    } else {
      break;
    }
  }

  return Math.min(matchingChars / 5, 1);
}

/**
 * Finds the best-matching open "lost" reports for a given found report.
 * Combines location proximity (60% weight) and description similarity (40%),
 * since location is generally more reliable than free-text wording.
 * Reads at most 50 lost reports per call to stay within Firebase free-tier limits.
 */
export async function findMatchesForFoundReport(foundReport, maxResults = 5) {
  const q = query(
    collection(db, 'reports'),
    where('type', '==', 'lost'),
    where('status', '==', 'lost'),
    orderBy('createdAt', 'desc'),
    fbLimit(50)
  );

  const snapshot = await getDocs(q);
  const candidates = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const scored = candidates.map((lostReport) => {
    const locationScore = geohashProximityScore(
      lostReport.geohash,
      foundReport.geohash
    );
    const descScore = descriptionSimilarity(
      lostReport.description,
      foundReport.description
    );
    const totalScore = locationScore * 0.6 + descScore * 0.4;

    return { ...lostReport, matchScore: totalScore };
  });

  return scored
    .filter((report) => report.matchScore > 0.15) // ignore very weak matches
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, maxResults);
}