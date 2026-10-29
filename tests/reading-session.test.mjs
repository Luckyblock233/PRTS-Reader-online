import test from 'node:test';
import assert from 'node:assert/strict';
import {stepReadingIndex,resolveReadingPosition,saveReadingPosition} from '../reader/reading-session.js';

const chapters=[{id:'one',sha256:'hash-1',lineCount:12,type:'MAINLINE'},{id:'two',sha256:'hash-2',lineCount:20}];
const saved={chapterId:'two',sourceHash:'hash-2',index:9};
test('up/down follows visible text indices, skipping hidden rows and commands',()=>{
  assert.equal(stepReadingIndex([2,7,98,100],98,1),100);
  assert.equal(stepReadingIndex([2,7,98,100],98,-1),7);
  assert.equal(stepReadingIndex([2,7,100],98,1),100);
  assert.equal(stepReadingIndex([2,7,100],98,-1),7);
});
test('boundaries do not loop or cross chapters',()=>{
  assert.equal(stepReadingIndex([2,7],7,1),null);
  assert.equal(stepReadingIndex([2,7],2,-1),null);
  assert.equal(stepReadingIndex([],null,1),null);
  assert.equal(stepReadingIndex([2,7],null,1),2);
});
test('opening the root restores saved chapter and paragraph',()=>{
  assert.deepEqual(resolveReadingPosition(chapters,'',saved,'one'),{chapterId:'two',index:9});
});
test('an explicit valid deep link wins over a stored paragraph',()=>{
  assert.deepEqual(resolveReadingPosition(chapters,'#one/7',saved),{chapterId:'one',index:7});
  assert.deepEqual(resolveReadingPosition(chapters,'#two/0',saved),{chapterId:'two',index:0});
});
test('a chapter-only link resumes only that same chapter',()=>{
  assert.deepEqual(resolveReadingPosition(chapters,'#two',saved),{chapterId:'two',index:9});
  assert.deepEqual(resolveReadingPosition(chapters,'#one',saved),{chapterId:'one',index:null});
});
test('mismatched source hash, invalid saved paragraph, and unknown chapters are ignored',()=>{
  for(const bad of [{...saved,sourceHash:'old'},{...saved,index:20},{...saved,index:-1},{...saved,chapterId:'absent'}]){
    assert.deepEqual(resolveReadingPosition(chapters,'',bad,'one'),{chapterId:'one',index:null});
  }
});
test('malformed and out-of-bounds deep links do not become an invalid selection',()=>{
  for(const hash of ['#one/12','#one/-1','#one/NaN','#one/999999999999999999999']){
    assert.deepEqual(resolveReadingPosition(chapters,hash,saved),{chapterId:'one',index:null});
  }
});
test('old chapter-only history still works',()=>{
  assert.deepEqual(resolveReadingPosition(chapters,'',null,'two'),{chapterId:'two',index:null});
});
test('selection is persisted immediately with snapshot and source hash',()=>{
  let written;
  globalThis.localStorage={setItem:(key,value)=>{written={key,value:JSON.parse(value)}}};
  try {
    saveReadingPosition('snapshot',chapters[1],9);
    assert.equal(written.key,'terra-reading-position-snapshot');
    assert.equal(written.value.index,9);
    assert.equal(written.value.sourceHash,'hash-2');
    assert.equal(written.value.chapterId,'two');
  } finally {delete globalThis.localStorage}
});
