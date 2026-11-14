function luminance(hex) {
    const [r, g, b] = hex.match(/[a-f\d]{2}/gi).map(n => parseInt(n, 16) / 255)
        .map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
    return .2126 * r + .7152 * g + .0722 * b;
}
const pairs = [
    ['ink/paper', '#202b27', '#f5f3ed', 4.5],
    ['muted/paper', '#52605a', '#f5f3ed', 4.5],
    ['ink/white', '#202b27', '#ffffff', 4.5],
    ['muted/white', '#52605a', '#ffffff', 4.5],
    ['green/white', '#175640', '#ffffff', 4.5],
    ['green/paper', '#175640', '#f5f3ed', 4.5],
    ['white/green-hover', '#ffffff', '#103d2e', 4.5],
    ['error/white', '#872d24', '#ffffff', 4.5],
    ['error/paper', '#872d24', '#f5f3ed', 4.5],
    ['warning-text/warning', '#573a0d', '#fff4dc', 4.5],
    ['edge/white', '#78867c', '#ffffff', 3],
    ['edge/paper', '#78867c', '#f5f3ed', 3],
    ['focus/image-stage', '#175640', '#e2e5dd', 3],
    ['ink/secondary-hover', '#202b27', '#e7ece6', 4.5]
];
let failed = false;
for (const [name, foreground, background, minimum] of pairs) {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    const ratio = (values[0] + .05) / (values[1] + .05);
    const passes = ratio >= minimum;
    failed ||= !passes;
    console.log(`${passes ? 'PASS' : 'FAIL'} ${name}: ${ratio.toFixed(2)}:1 (minimum ${minimum})`);
}
if (failed) process.exitCode = 1;
