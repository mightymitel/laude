import { resursecrestineScraper } from './apps/api/dist/scrapers/resursecrestine.js';

const url = 'https://www.resursecrestine.ro/acorduri/96109/leul-din-iuda';
console.log('Testing real URL:', url);

const result = await resursecrestineScraper.scrape(url);

console.log('\n=== Song Info ===');
console.log('Title:', result.title);
console.log('Key:', result.originalKey);

console.log('\n=== First Verse Lines ===');
const firstVerse = result.parts.find(p => p.type === 'verse');
if (firstVerse) {
    firstVerse.lines.forEach((line, i) => {
        console.log(`${i + 1}:`, line.text);
    });
}
