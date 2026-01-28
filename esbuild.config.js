/**
 * esbuild configuration for fast compilation
 * TypeScript type checking is done separately with tsc --emitDeclarationOnly
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function build() {
  try {
    // Ensure dist directory exists
    const distDir = path.join(__dirname, 'dist');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    // Compile all TypeScript source files
    const srcFiles = getAllTsFiles('src');
    await esbuild.build({
      entryPoints: srcFiles,
      outdir: 'dist',
      platform: 'node',
      target: 'node14', // Match package.json engines
      format: 'cjs', // CommonJS for Node.js
      sourcemap: true,
      minify: false, // Don't minify library code
      logLevel: 'info',
      outbase: 'src', // Preserve directory structure
    });

    console.log('✅ esbuild compilation completed successfully');
  } catch (error) {
    console.error('❌ esbuild compilation failed:', error);
    process.exit(1);
  }
}

// Helper function to recursively get all .ts files
function getAllTsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      getAllTsFiles(filePath, fileList);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

build();
