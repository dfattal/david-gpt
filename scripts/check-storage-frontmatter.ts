import { createClient } from '@supabase/supabase-js';
import matter from 'gray-matter';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkStorageFile(personaSlug: string, filename: string) {
  const path = `${personaSlug}/${filename}`;

  // Download the file
  const { data, error } = await supabase.storage
    .from('formatted-documents')
    .download(path);

  if (error) {
    console.error(`Error downloading ${path}:`, error);
    return;
  }

  // Read the content
  const content = await data.text();

  // Parse frontmatter
  const { data: frontmatter } = matter(content);

  console.log(`\n=== ${filename} ===`);
  console.log('Frontmatter fields:', Object.keys(frontmatter));
  console.log('Has personas field:', 'personas' in frontmatter);
  console.log('Personas value:', frontmatter.personas);
  console.log('First 50 lines of file:');
  console.log(content.split('\n').slice(0, 50).join('\n'));
}

async function main() {
  const files = [
    '2401-10891.md',
    '2501-11841.md',
  ];

  for (const file of files) {
    await checkStorageFile('legal', file);
  }
}

main().catch(console.error);
