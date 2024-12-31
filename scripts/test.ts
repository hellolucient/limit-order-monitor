// First check if we can do basic logging
console.log('🟢 Starting test script...')

// Check if we can access process
console.log('🟢 Node version:', process.version)
console.log('🟢 Current directory:', process.cwd())

// Check if we can read files
import fs from 'fs'
console.log('🟢 Files in current directory:', fs.readdirSync('.'))

// Try a basic HTTP request
import https from 'https'
console.log('🟢 Attempting HTTP request...')

https.get('https://api.github.com', (res) => {
    console.log('🟢 Response status:', res.statusCode)
    res.on('data', () => {/* ignore data */})
    res.on('end', () => {
        console.log('🟢 Request completed')
        process.exit(0)
    })
}).on('error', (err) => {
    console.error('🔴 Error:', err)
    process.exit(1)
})

// Keep process alive
console.log('🟢 Waiting for request to complete...') 