const fs = require('fs');

async function testSingleDocumentIngest() {
  console.log('🚀 Testing single document ingest API...\n');
  
  const cookies = 'sb-mnjrwjtzfjfixdjrerke-auth-token.0=base64-eyJhY2Nlc3NfdG9rZW4iOiJleUpoYkdjaU9pSklVekkxTmlJc0ltdHBaQ0k2SWxaSWVYUmtSSEpPUTBkUlNuVjVhVFVpTENKMGVYQWlPaUpLVjFRaWZRLmV5SnBjM01pT2lKb2RIUndjem92TDIxdWFuSjNhblI2Wm1wbWFYaGthbkpsY210bExuTjFjR0ZpWVhObExtTnZMMkYxZEdndmRqRWlMQ0p6ZFdJaU9pSmlNelE1WW1ReE1TMWlaRFk1TFRRMU9ESXRPVGN4TXkwellXUmhNR0poTlRobVkyWWlMQ0poZFdRaU9pSmhkWFJvWlc1MGFXTmhkR1ZrSWl3aVpYaHdJam94TnpVM01qTXlPVEEzTENKcFlYUWlPakUzTlRjeU1qa3pNRGNzSW1WdFlXbHNJam9pWkdaaGRIUmhiRUJuYldGcGJDNWpiMjBpTENKd2FHOXVaU0k2SWlJc0ltRndjRjl0WlhSaFpHRjBZU0k2ZXlKd2NtOTJhV1JsY2lJNkltZHZiMmRzWlNJc0luQnliM1pwWkdWeWN5STZXeUpuYjI5bmJHVWlYWDBzSW5WelpYSmZiV1YwWVdSaGRHRWlPbnNpWVhaaGRHRnlYM1Z5YkNJNkltaDBkSEJ6T2k4dmJHZ3pMbWR2YjJkc1pYVnpaWEpqYjI1MFpXNTBMbU52YlM5aEwwRkRaemh2WTBzNVZteDZVekJ6ZDFNNVZFMVVlRjlZTFhobFEzSTJTREl6T1daek0yVmlhRTFEWkZGWU1UbDBTRlpUUTJoamJIWjZQWE01Tmkxaklpd2laVzFoYVd3aU9pSmtabUYwZEdGc1FHZHRZV2xzTG1OdmJTSXNJbVZ0WVdsc1gzWmxjbWxtYVdWa0lqcDBjblZsTENKbWRXeHNYMjVoYldVaU9pSkVZWFpwWkNCR1lYUjBZV3dpTENKcGMzTWlPaUpvZEhSd2N6b3ZMMkZqWTI5MWJuUnpMbWR2YjJkc1pTNWpiMjBpTENKdVlXMWxJam9pUkdGMmFXUWdSbUYwZEdGc0lpd2ljR2h2Ym1WZmRtVnlhV1pwWldRaU9tWmhiSE5sTENKd2FXTjBkWEpsSWpvaWFIUjBjSE02THk5c2FETXVaMjl2WjJ4bGRYTmxjbU52Ym5SbGJuUXVZMjl0TDJFdlFVTm5PRzlqU3psV2JIcFRNSE4zVXpsVVRWUjRYMWd0ZUdWRGNqWklNak01Wm5NelpXSm9UVU5rVVZneE9YUklWbE5EYUdOc2RubzljemsyTFdNaUxDSndjbTkyYVdSbGNsOXBaQ0k2SWpFd01UTXlPREl4TmpJNU5UWTRORE0wTkRNNU9DSXNJbk4xWWlJNklqRXdNVE15T0RJeE5qSTVOVFk0TkRNME5ETTVPQ0o5TENKeWIyeGxJam9pWVhWMGFHVnVkR2xqWVhSbFpDSXNJbUZoYkNJNkltRmhiREVpTENKaGJYSWlPbHQ3SW0xbGRHaHZaQ0k2SW05aGRYUm9JaXdpZEdsdFpYTjBZVzF3SWpveE56VTJPVFV3TURFemZWMHNJbk5sYzNOcGIyNWZhV1FpT2lKaE9HWTBNMll3T0MwMlltSmlMVFJpTURjdE9XTTBNUzAzTXpKbFlXVXdPREJqTWpFaUxDSnBjMTloYm05dWVXMXZkWE1pT21aaGJITmxmUS5VZkVZUElmY25wbW9iSnI0UG1LTFRnUEIzQjBOM2Vuel9JSTM1YnNFTGpNIiwidG9rZW5fdHlwZSI6ImJlYXJlciIsImV4cGlyZXNfaW4iOjM2MDAsImV4cGlyZXNfYXQiOjE3NTcyMzI5MDcsInJlZnJlc2hfdG9rZW4iOiJqZ2d3dWdsNHFxcmgiLCJ1c2VyIjp7ImlkIjoiYjM0OWJkMTEtYmQ2OS00NTgyLTk3MTMtM2FkYTBiYTU4ZmNmIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiZW1haWwiOiJkZmF0dGFsQGdtYWlsLmNvbSIsImVtYWlsX2NvbmZpcm1lZF9hdCI6IjIwMjUtMDgtMjJUMTg6MjM6MjQuMTE3MjRaIiwicGhvbmUiOiIiLCJjb25maXJtZWRfYXQiOiIyMDI1LTA4LTIyVDE4OjIzOjI0LjExNzI0WiIsImxhc3Rfc2lnbl9pbl9hdCI6IjIwMjUtMDktMDRUMTc6NDM6MTIuMTQzODg3WiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6Imdvb2dsZSIsInByb3ZpZGVycyI6WyJnb29nbGUiXX0sInVzZXJfbWV0YWRhdGEiOnsiYXZhdGFyX3VybCI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0s5Vmx6UzBzd1M5VE1UeF9YLXhlQ3I2SDIzOWZzM2ViaE1DZFFYMTl0SFZTQ2hjbHZ6PXM5Ni1jIiwiZW1haWwiOiJkZmF0dGFsQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmdWxsX25hbWUiOiJEYXZpZCBGYXR0YWwiLCJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJuYW1lIjoiRGF2aWQgRmF0dGFsIiwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUNnOG9jSzlWbHpTMHN3UzlUTVR4X1gteGVDcjZIMjM5ZnMzZWJoTUNkUVgxOXRIVlNDaGNsdno9czk2LWMiLCJwcm92aWRlcl9pZCI6IjEwMTMyODIxNjI5NTY4NDM0NDM5OCIsInN1YiI6IjEwMTMyODIxNjI5NTY4NDM0NDM5OCJ9LCJpZGVudGl0aWVzIjpbeyJpZGVudGl0eV9pZCI6IjNkMWY5OTJjLWUxNDQtNGM1My1iN2ViLTJmODY3NjY3NDBmNCIsImlkIjoiMTAxMzI4MjE2Mjk1Njg0MzQ0Mzk4IiwidXNlcl9pZCI6ImIzNDliZDExLWJkNjktNDU4Mi05NzEzLTNhZGEwYmE1OGZjZiIsImlkZW50aXR5X2RhdGEiOnsifQ%3D%3D; sb-mnjrwjtzfjfixdjrerke-auth-token.1=nsiYXZhdGFyX3VybCI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0s5Vmx6UzBzd1M5VE1UeF9YLXhlQ3I2SDIzOWZzM2ViaE1DZFFYMTl0SFZTQ2hjbHZ6PXM5Ni1jIiwiZW1haWwiOiJkZmF0dGFsQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmdWxsX25hbWUiOiJEYXZpZCBGYXR0YWwiLCJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJuYW1lIjoiRGF2aWQgRmF0dGFsIiwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUNnOG9jSzlWbHpTMHN3UzlUTVR4X1gteGVDcjZIMjM5ZnMzZWJoTUNkUVgxOXRIVlNDaGNsdno9czk2LWMiLCJwcm92aWRlcl9pZCI6IjEwMTMyODIxNjI5NTY4NDM0NDM5OCIsInN1YiI6IjEwMTMyODIxNjI5NTY4NDM0NDM5OCJ9LCJwcm92aWRlciI6Imdvb2dsZSIsImxhc3Rfc2lnbl9pbl9hdCI6IjIwMjUtMDgtMjJUMTg6MjM6MjQuMTAyMzUxWiIsImNyZWF0ZWRfYXQiOiIyMDI1LTA4LTIyVDE4OjIzOjI0LjEwMjQxWiIsInVwZGF0ZWRfYXQiOiIyMDI1LTA5LTA0VDE3OjQzOjA3LjI5MjY1MVoiLCJlbWFpbCI6ImRmYXR0YWxAZ21haWwuY29tIn1dLCJjcmVhdGVkX2F0IjoiMjAyNS0wOC0yMlQxODoyMzoyNC4wNTM1ODlaIiwidXBkYXRlZF9hdCI6IjIwMjUtMDktMDdUMDc6MTU6MDcuNjg0NDA0WiIsImlzX2Fub255bW91cyI6ZmFsc2V9fQ';

  // Test cases to try
  const testCases = [
    {
      name: "Patent URL - US11281020B2",
      payload: {
        title: "Multi-view display system patent",
        docType: "patent",
        patentUrl: "https://patents.google.com/patent/US11281020B2/en?oq=WO2012038876A1"
      }
    },
    {
      name: "Simple Text Content",
      payload: {
        title: "Test Document",
        docType: "note", 
        content: "This is a test document with some content for chunking."
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n🧪 Testing: ${testCase.name}`);
    console.log(`Payload:`, JSON.stringify(testCase.payload, null, 2));
    
    try {
      const response = await fetch('http://localhost:3001/api/documents/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookies
        },
        body: JSON.stringify(testCase.payload)
      });

      console.log(`Response Status: ${response.status}`);
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Success:', JSON.stringify(result, null, 2));
        
        // Monitor processing if successful
        if (result.jobId) {
          await monitorJob(result.jobId, cookies);
        }
      } else {
        const errorText = await response.text();
        console.log('❌ Error Response:', errorText.substring(0, 500));
      }
      
    } catch (error) {
      console.error('❌ Request Error:', error.message);
    }
  }
}

async function monitorJob(jobId, cookies) {
  console.log(`\n📊 Monitoring job: ${jobId}`);
  
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const response = await fetch(`http://localhost:3001/api/processing-jobs/${jobId}`, {
        headers: { 'Cookie': cookies }
      });
      
      if (response.ok) {
        const job = await response.json();
        console.log(`Status: ${job.status} | Progress: ${job.progress} | ${job.progress_message || ''}`);
        
        if (job.status === 'completed') {
          console.log('✅ Job completed!', job.results);
          break;
        } else if (job.status === 'failed') {
          console.log('❌ Job failed:', job.error_message);
          break;
        }
      } else {
        console.log('⚠️  Could not fetch job status');
      }
      
      attempts++;
    } catch (error) {
      console.log('⚠️  Error monitoring job:', error.message);
      break;
    }
  }
}

testSingleDocumentIngest();