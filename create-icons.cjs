const fs = require('fs');

const createSvgIcon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="100%" height="100%" fill="#6A5ACD"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" 
        font-family="Arial" font-size="${size * 0.4}" fill="white" font-weight="bold">H</text>
</svg>`;

fs.writeFileSync('apps/web/public/icon-192.svg', createSvgIcon(192));
fs.writeFileSync('apps/web/public/icon-512.svg', createSvgIcon(512));

console.log('✅ SVG icons created: icon-192.svg, icon-512.svg');
