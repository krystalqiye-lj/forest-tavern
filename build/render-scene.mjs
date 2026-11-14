import { createRequire } from 'node:module';
import { once } from 'node:events';

const [scene, file] = process.argv.slice(2);
const sharp = process.env.FOREST_SHARP ? createRequire(import.meta.url)(process.env.FOREST_SHARP) :
    createRequire(import.meta.url)('sharp');
const wide = scene === 'lake' || scene === 'falls';
const width = 1440, height = wide ? 810 : 960;
const ratio = width / (wide ? 1672 : 1536), ratioY = height / (wide ? 941 : 1024), frames = 240;
const source = await sharp(file).resize(width, height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
for (let i = 0; i < source.length; i += 4) [source[i], source[i + 2]] = [source[i + 2], source[i]];
const frame = Buffer.allocUnsafe(source.length);
const limit = value => Math.max(0, Math.min(1, value));
const waterRegions = {
    creek: [
    [[693,416],[795,425],[878,458],[879,509],[824,478],[751,451]],
    [[1006,477],[1118,466],[1184,495],[1210,525],[1403,532],[1535,557],[1535,620],[1436,584],[1294,576],[1217,555],[1136,529],[1036,525]],
    [[1041,641],[1115,649],[1227,651],[1330,623],[1418,641],[1535,654],[1535,1023],[1025,1023],[1070,959],[1147,895],[1080,829],[1014,791],[1020,733]],
    [[651,698],[791,692],[855,676],[854,731],[822,781],[768,797],[716,764],[684,734]],
    [[706,980],[775,931],[891,936],[981,959],[1041,1023],[684,1023]],
    ],
    lake: [[
        [236,421],[416,414],[712,411],[1090,416],[1650,414],[1671,568],[1620,587],
        [1558,596],[1490,630],[1396,613],[1300,598],[1230,615],[1183,643],
        [1103,638],[1043,631],[930,615],[851,598],[781,590],[706,559],[626,543],
        [524,534],[436,509],[359,485],[279,480],[238,464],
    ]],
    falls: [[
        [365,726],[503,693],[669,679],[800,673],[1075,680],[1240,687],[1420,688],
        [1669,700],[1670,810],[1490,818],[1300,854],[1135,842],[940,840],[781,818],
        [669,811],[586,786],[468,775],[391,760],
    ]],
};
const regions = (waterRegions[scene] ?? []).map(poly => poly.map(([x,y]) => [x * ratio, y * ratioY]));
const cascade = [
    [404,24],[473,36],[561,71],[630,122],[662,214],[685,307],[716,408],[745,510],
    [788,603],[814,645],[906,666],[890,687],[728,695],[603,698],[462,679],
    [515,631],[487,566],[450,499],[421,403],[401,289],[403,148],
].map(([x,y]) => [x * ratio, y * ratioY]);

function coverage(x, y, polygon) {
    let inside = false, edge = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [a,b] = polygon[i], [c,d] = polygon[j];
        if ((b > y) !== (d > y) && x < (c-a)*(y-b)/(d-b)+a) inside = !inside;
        const dx=c-a, dy=d-b, t=limit(((x-a)*dx+(y-b)*dy)/(dx*dx+dy*dy));
        edge = Math.min(edge, (x-a-t*dx)**2+(y-b-t*dy)**2);
    }
    return inside ? Math.min(1, Math.sqrt(edge)/19) : 0;
}

const water = [], falling = [];
if (regions.length || scene === 'falls') {
    const yStart = scene === 'falls' ? 19 : 340;
    for (let y = yStart; y < height-8; y++) for (let x = 8; x < width-8; x++) {
        const i=(y*width+x)*4;
        const [b,g,r]=[source[i],source[i+1],source[i+2]];
        if (scene === 'falls' && x > 345 * ratio && x < 910 * ratio && y < 700 * ratioY) {
            const mask = coverage(x, y, cascade);
            if (mask > .025) {
                const foam = limit((b - 72) / 105) * limit((25 - Math.abs(g-b)) / 22);
                const spray = limit((y / ratioY - 470) / 215);
                if (foam > .025) falling.push({x, y, i, mask: mask * foam, spray});
            }
        }
        let mask=0;
        for (const region of regions) mask=Math.max(mask, coverage(x,y,region));
        if (mask < .04) continue;
        const hue=scene === 'lake' ? limit((g+15-b)/52) : limit((b+25-Math.min(r,g))/32);
        const depth=limit((y-yStart)/(height-yStart));
        const amount=mask*(.32+.68*depth)*(.43+.57*hue);
        water.push({x,y,i,amount,shine:mask*hue*(scene === 'lake' ? 3.65 : 2.65)});
    }
}

const foliageByScene={
    oak: [
    [239,130,193,97,0,3.9], [435,45,146,84,1.2,5.6], [792,88,178,87,2.1,4.4],
    [1259,112,200,114,1.4,4.2], [244,711,175,126,.7,4.8], [1312,691,166,91,3.1,6.8],
    [109,943,116,123,2.2,7], [1447,892,95,98,1.9,8],
    ],
    creek: [
    [217,326,134,87,0,4], [1294,277,174,92,.76,6.4], [584,276,136,81,1.4,4.6],
    [260,818,172,118,2.2,5], [1463,443,97,72,2.9,5.4], [65,967,105,80,2.5,7],
    ],
    lake: [
        [605,45,191,92,0,5.8], [1030,58,150,62,2.3,6.5], [1490,95,170,98,1.4,5.9],
        [116,694,130,89,2.1,7.6], [1553,785,142,112,.8,7.1],
    ],
    falls: [
        [929,74,133,86,1.6,5.7], [1239,118,169,102,2.9,5.9],
        [1523,77,141,113,2.7,6.4], [165,323,111,104,.72,6.3],
        [1565,549,131,97,2.2,6.5], [1597,829,93,122,.21,7.5],
    ],
};
const foliage=foliageByScene[scene].map(([cx,cy,rx,ry,phase,amp])=>({
    cx: cx*ratio, cy: cy*ratioY, rx: rx*ratio, ry: ry*ratioY, phase, amp,
}));

function sample(i, x, y, shine = 0) {
    const ix=Math.floor(x), iy=Math.floor(y), fx=x-ix, fy=y-iy;
    const a=(iy*width+ix)*4, b=a+width*4;
    for (let c=0;c<3;c++) {
        const u=source[a+c]*(1-fx)+source[a+c+4]*fx;
        const v=source[b+c]*(1-fx)+source[b+c+4]*fx;
        frame[i+c]=Math.max(0,Math.min(255,u*(1-fy)+v*fy+shine));
    }
}

for (let i = 0; i < frames; i++) {
    const t = i / frames * 2 * Math.PI;
    source.copy(frame);
    for (const {x,y,i,amount,shine} of water) {
        const quiet = scene === 'lake';
        const wave=Math.sin(x*(quiet?.011:.038)-y*(quiet?.19:.06)+t*(quiet?2:4));
        const chop=Math.sin(x*(quiet?.037:.09)+y*.12-t*(quiet?3:7));
        const dx=amount*(wave*(quiet?1.45:3.2)+chop*.92), dy=amount*(wave*(quiet?1.9:1.55)+chop*.7);
        sample(i,x+dx,y+dy,shine*(wave*.7+chop*.3));
    }
    for (const {x,y,i,mask,spray} of falling) {
        // Bands travel down the columns of white water; the banks and rocks don't move.
        const main = Math.sin(y*.077-x*.026-t*13), drops = Math.sin(y*.24+x*.069-t*26);
        const shimmer = Math.sin(y*.149 - x*.121 - t*20);
        const dx = mask * (main * 2.1 + shimmer * 1.1);
        const dy = mask * (main * 6.4 + drops * 3.2) * (1 - .46 * spray);
        sample(i, Math.max(1, x + dx), Math.max(1, y + dy), mask * (main * 8.3 + drops * 5.2 + shimmer * 2.7));
    }
    for (const {cx,cy,rx,ry,phase,amp} of foliage) {
        const pulse = .7 + .3 * Math.sin(t * 2 - phase);
        for (let y=Math.max(2,Math.ceil(cy-ry));y<Math.min(height-2,cy+ry);y++) {
            const q=(y-cy)/ry;
            const delta=amp*pulse*(.65*Math.sin(t*3+phase+y*.031)+.25*Math.sin(t*6-y*.041+phase))*(.66-.34*q);
            for (let x=Math.max(9,Math.ceil(cx-rx));x<Math.min(width-9,cx+rx);x++) {
                const f = 1 - ((x-cx)/rx)**2 - q*q;
                if (f > 0) sample((y*width+x)*4,x+delta*f*f,y);
            }
        }
    }
    if (!process.stdout.write(frame)) await once(process.stdout,'drain');
}
