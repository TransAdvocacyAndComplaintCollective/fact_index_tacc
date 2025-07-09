import fs from 'fs';
let dotenvLoaded = false;
if (fs.existsSync('.env_tacc')) {
  await import('dotenv').then(dotenv => dotenv.config({ path: '.env_tacc' }));
  console.log('Loaded .env_tacc');
  dotenvLoaded = true;
} else if (fs.existsSync('.env')) {
  await import('dotenv').then(dotenv => dotenv.config({ path: '.env' }));
  console.log('Loaded .env');
  dotenvLoaded = true;
} else {
  console.warn('No .env_tacc or .env file found!');
}
if(dotenvLoaded){
  console.log('Environment variables loaded successfully');
}
else {
  console.warn('No environment variables loaded. Ensure .env_tacc or .env exists.');
}