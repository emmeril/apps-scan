import { deflateSync } from 'node:zlib';

export function samplePdf() {
    const stream = text => `BT /F1 22 Tf 56 760 Td (${text}) Tj 0 -42 Td /F1 12 Tf (DOKUMEN CONTOH PENGUJIAN - bukan dokumen kantor) Tj ET`;
    const first = stream('Contoh hasil scan - halaman 1');
    const second = stream('Contoh hasil scan - halaman 2');
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
        `<< /Length ${Buffer.byteLength(first)} >>\nstream\n${first}\nendstream`,
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
        `<< /Length ${Buffer.byteLength(second)} >>\nstream\n${second}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    let content = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(content));
        content += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const start = Buffer.byteLength(content);
    content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    content += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
    return Buffer.from(content);
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
    const type = Buffer.from(name);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
    return Buffer.concat([size, type, data, crc]);
}
export function samplePng() {
    const width = 300, height = 420;
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
    const pixels = Buffer.alloc((width * 3 + 1) * height, 255);
    for (let y = 0; y < height; y++) {
        pixels[y * (width * 3 + 1)] = 0;
        for (let x = 30; x < 270; x++) {
            if ((y >= 50 && y < 65) || (y >= 95 && y < 340 && y % 22 < 3)) {
                const offset = y * (width * 3 + 1) + 1 + x * 3;
                pixels[offset] = 60; pixels[offset + 1] = 75; pixels[offset + 2] = 65;
            }
        }
    }
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
