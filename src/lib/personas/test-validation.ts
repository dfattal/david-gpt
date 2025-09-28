#!/usr/bin/env tsx
import { PersonaValidator } from './persona-validator';
import { ConstraintsParser } from './constraints-parser';
import { join } from 'path';

async function testPersonaValidation() {
  console.log('🧪 Testing Persona Validation System');
  console.log('====================================\n');

  const personasToTest = ['david', 'legal'];

  for (const personaId of personasToTest) {
    console.log(`Testing persona: ${personaId}`);
    console.log('-'.repeat(30));

    const personaPath = join(process.cwd(), 'personas', personaId);

    try {
      // Test persona validation
      const validationResult =
        await PersonaValidator.validateFromDisk(personaPath);
      console.log(PersonaValidator.formatValidationReport(validationResult));

      console.log('\n');

      // Test constraints parsing
      const parseResult =
        await ConstraintsParser.parseFromPersonaFolder(personaPath);

      if (parseResult.success && parseResult.constraints) {
        console.log('Constraints Summary:');
        console.log(
          ConstraintsParser.generateConstraintsSummary(parseResult.constraints)
        );
      } else {
        console.log('❌ Failed to parse constraints:');
        parseResult.errors.forEach(error => console.log(`   ${error}`));
      }

      console.log('\n' + '='.repeat(50) + '\n');
    } catch (error) {
      console.error(`❌ Error testing ${personaId}:`, error);
    }
  }
}

// Run if called directly
if (require.main === module) {
  testPersonaValidation().catch(console.error);
}

export { testPersonaValidation };
