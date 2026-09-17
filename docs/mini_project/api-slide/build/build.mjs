import fs from 'node:fs/promises';
import { Presentation, PresentationFile } from '@oai/artifact-tool';
import { finalizePresentation } from '/Users/macbookpro/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root='/Users/macbookpro/Desktop/Work/I-Dont-Know-Seoul/docs/mini_project/api-slide';
const skill='/Users/macbookpro/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations';
const p=Presentation.create({slideSize:{width:1440,height:810}});
const s=p.slides.add(); s.background.fill='#FAFAFA';
const font='IBM Plex Sans KR';
function text(t,x,y,w,h,size,color='#191919',bold=false){
 const o=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 o.text=t; o.text.style={typeface:font,fontSize:size,color,bold,autoFit:'none'}; return o;
}
text('0 5  /  시 스 템  설 계',54,65,600,32,18,'#0069D9');
text('GET /api/data',54,113,1300,82,60,'#191919',true);
text('지도 탐색에 필요한 데이터를 한 번에 받는 API',54,202,1300,45,28,'#555555');
text('최초 로딩 시 번들 조회',54,302,420,45,31,'#0069D9',true);
text('Cloudflare KV의 JSON 데이터\n약 8 MB 규모의 응답',54,365,420,85,27,'#555555');
text('조건 변경 시 브라우저 계산',54,505,425,45,30,'#0069D9',true);
text('통근시간·등급·추천 순위 재계산\n조건마다 계산 API를 호출하지 않음',54,568,430,85,25,'#555555');
const values=[
 ['필드','내용','규모'],
 ['meta','출처·버전·기준 시점','—'],
 ['pctKeys','백분위 배열의 지표 순서','9개 지표'],
 ['axisWeights','치안·가격·편의 하위 지표 가중치','3개 축'],
 ['unavailableAxes','결측으로 점수를 내지 못한 축','현재 0개'],
 ['dongs','행정동 코드·이름·자치구·면적·좌표','556개 동'],
 ['graph','지하철 역·노드·엣지','역 624 / 엣지 762'],
 ['bus','버스 정류장·노선','정류장 41,423 / 노선 2,943'],
 ['residential','100m 거주인구 격자 요약 프로필¹','556개 동'],
 ['scores','동별 축 점수·백분위·원지표·월세 조합','556개 동'],
];
const tab=s.tables.add({rows:10,columns:3,left:520,top:294,width:866,height:400,columnWidths:[205,388,273],values});
tab.borders.assign({fill:'#DDDDDD',width:0.5,style:'solid'});
tab.cells.block({row:0,column:0,rowCount:10,columnCount:3}).assign({textStyle:{typeface:font,fontSize:18,color:'#555555'},margins:{left:12,right:8,top:9,bottom:9}});
for(let r=0;r<10;r++){
 tab.rows[r].height=40;
 for(let c=0;c<3;c++)tab.getCell(r,c).fill=r===0?'#EAF2FC':'#FAFAFA';
 tab.getCell(r,0).text.style={typeface:font,fontSize:18,color:r===0?'#0069D9':'#191919',bold:true};
}
for(let c=0;c<3;c++)tab.getCell(0,c).text.style={typeface:font,fontSize:18,color:'#0069D9',bold:true};
text('¹ 동별 대표 프로필에는 좌표를 포함하지 않음',520,718,866,30,17,'#777777');
s.speakerNotes.textFrame.setText('GET /api/data는 미리 가공한 공통 데이터 번들을 제공합니다. 브라우저는 받은 데이터를 사용해 통근시간과 등급, 추천 순위를 계산합니다. 조건 변경마다 서버 계산 API를 호출하지 않는 구조입니다. 약 8 MB는 제공된 자료의 응답 규모이며 압축된 네트워크 전송량을 측정한 값은 아닙니다. 데이터 규모와 필드 구성 출처: 사용자 첨부 codex-clipboard-daed72fe-5a3d-4bcc-a507-038d3f245268.png. 시각 참고: /Users/macbookpro/Downloads/I-Dont-Know-Seoul-PPT.pdf 19~22쪽. 기존 슬라이드의 547개와 달리 이번 슬라이드는 첨부 표의 556개를 사용합니다.');
await (await PresentationFile.exportPptx(p)).save(root+'/build/candidate.pptx');
const img=await p.export({slide:s,format:'png',scale:1});
await fs.writeFile(root+'/build/preview.png',new Uint8Array(await img.arrayBuffer()));
await finalizePresentation({workspaceDir:root,candidatePath:root+'/build/candidate.pptx',finalPath:root+'/output/I-Dont-Know-Seoul_API-data.pptx',pythonExecutable:'/Users/macbookpro/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',integrityValidatorPath:skill+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:skill+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','13716000,7715250','--validate-heading-fit','--require-native-table-slide','1'],explicitTotalSlideCount:1,requiredNativeTableOwnerSlides:[1],fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:root+'/build/validation.json'});
console.log('DONE');
