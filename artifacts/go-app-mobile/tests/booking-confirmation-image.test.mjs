import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{React,evaluate}=require('./helpers/react-lifecycle.cjs');
const api=evaluate('components/booking/BookingConfirmationImage.tsx',{'react-native-svg':{default:'Svg',Rect:'Rect',Text:'SvgText'}});
test('image lines retain long business/service/reference text without ellipses or fixed vertical cropping',()=>{
 const input='RESERVA CONFIRMADA\n'+('W'.repeat(100))+'\nReferencia: 10000000-0000-4000-8000-000000000020\n30/10/2026 · 20:00';
 const lines=api.confirmationImageLines(input);assert.equal(lines.slice(1,6).join(''),'W'.repeat(100));assert.equal(lines.join(' ').includes('10000000-0000-4000-8000-000000000020'),true);assert.equal(lines.some(l=>l.includes('…')),false);
 assert.ok(lines.every(l=>!/^W{23}/.test(l)),'wide letters wrap before the image boundary');
 const tree=api.BookingConfirmationImage.render({message:input,accent:'#FFD700'},null);assert.equal(tree.props.width,'100%');assert.equal(tree.props.height,44+25*lines.length);assert.equal(tree.props.viewBox,`0 0 400 ${tree.props.height}`);
});
