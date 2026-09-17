"""Print edition of the OpenAPI contract embedded in api-docs.html."""
import json
import re
from html import escape
from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
    TableStyle, NextPageTemplate, PageBreak, KeepTogether, FrameBreak,
)

BASE = Path(__file__).resolve().parent
SPEC = json.JSONDecoder().raw_decode(
    (BASE / 'api-docs.html').read_text().split('const spec = ', 1)[1].lstrip()
)[0]
OUT = BASE / 'output/pdf/PG7반_P211_김기현_IDontKnowSeoul_API.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('KR', '/System/Library/Fonts/Supplemental/AppleGothic.ttf'))
W, H = landscape(A4)
M = 38
WIDTH = W - 2*M
GAP = 27
COL = (WIDTH-GAP)/2
INK = '#16352E'
GREEN = '#18705A'
MUTED = '#64746F'
PALE = '#F0F5F2'
LINE = '#D6E1DA'
METHODS = {'get':'#18705A','post':'#2365A5','patch':'#A26918','delete':'#B44846'}
styles = {
 'body': ParagraphStyle('body', fontName='KR', fontSize=9.2, leading=14, textColor=INK, spaceAfter=5, wordWrap='CJK'),
 'small': ParagraphStyle('small', fontName='KR', fontSize=8, leading=11.8, textColor=MUTED, spaceAfter=5, wordWrap='CJK'),
 'cell': ParagraphStyle('cell', fontName='KR', fontSize=8.5, leading=12.3, textColor=INK, wordWrap='CJK'),
 'label': ParagraphStyle('label', fontName='KR', fontSize=10.5, leading=15, textColor=GREEN, spaceBefore=9, spaceAfter=6, keepWithNext=True),
 'h': ParagraphStyle('h', fontName='KR', fontSize=20, leading=27, textColor=INK, spaceAfter=15, keepWithNext=True),
 'code': ParagraphStyle('code', fontName='KR', fontSize=8, leading=10.2, textColor=INK, wordWrap='CJK'),
}

def clean(s):
    return str(s).replace('↔',' / ').replace('→',' > ').replace('–','-').replace('—','-')

def p(s, style='body'):
    s=escape(clean(s))
    s=re.sub(r'`([^`]+)`', r'<font color="#18705A">\1</font>',s)
    return Paragraph(s.replace('\n','<br/>'),styles[style])

def paras(s, style='body'):
    blocks=re.split(r'\n\s*\n',s.strip())
    result=[]
    for b in blocks:
        # Preserve list boundaries while joining source-code line wrapping.
        b=re.sub(r'\n(?!\s*- )\s*',' ',b)
        result.append(p(b,style))
    return result

def heading(s): return p(s,'label')

def resolve(o):
    if '$ref' in o:
        x=SPEC
        for k in o['$ref'].split('/')[1:]: x=x[k]
        return x
    return o

def typename(s):
    if '$ref' in s: return s['$ref'].split('/')[-1]
    if 'allOf' in s: return ' + '.join(typename(v) for v in s['allOf'])
    if s.get('type')=='array': return typename(s.get('items',{}))+'[]'
    return s.get('type','object') + (' / '+s['format'] if 'format' in s else '')

def auth_label(o):
    security=o.get('security',SPEC.get('security',[]))
    if not security: return '공개 접근'
    if {} in security: return '공개 접근 / 선택 인증'
    return '로그인 필요'

def constraints(s):
    out=[]
    for key,label in [('minimum','최솟값'),('maximum','최댓값'),('minLength','최소 길이'),('maxLength','최대 길이'),('minItems','최소 항목'),('minProperties','최소 필드'),('pattern','패턴'),('default','기본값')]:
        if key in s: out.append(f'{label}: {s[key]}')
    if 'enum' in s: out.append('허용값: '+', '.join(map(str,s['enum'])))
    if s.get('nullable'): out.append('null 허용')
    if s.get('additionalProperties') is False: out.append('정의 외 필드 금지')
    elif isinstance(s.get('additionalProperties'),dict): out.append('추가 속성: '+typename(s['additionalProperties']))
    return ' / '.join(out)

def table(headers, rows, widths):
    data=[[p(x,'small') for x in headers]]+[[p(x,'cell') for x in row] for row in rows]
    t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),colors.HexColor(PALE)),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),
        ('TOPPADDING',(0,0),(-1,-1),4.5),('BOTTOMPADDING',(0,0),(-1,-1),4.5),
        ('LINEBELOW',(0,0),(-1,0),0.7,colors.HexColor(GREEN)),
        ('LINEBELOW',(0,1),(-1,-1),0.35,colors.HexColor(LINE)),
    ]))
    return t

def code(value):
    def compact(v,level=0):
        flat=json.dumps(v,ensure_ascii=False,separators=(', ', ': '))
        if len(flat)+level*2<=72: return [' '*level*2+flat]
        if isinstance(v,dict):
            lines=[' '*level*2+'{']
            for i,(k,x) in enumerate(v.items()):
                child=compact(x,level+1)
                child[0]=' '*(level+1)*2+json.dumps(k,ensure_ascii=False)+': '+child[0].lstrip()
                if i<len(v)-1:child[-1]+=','
                lines.extend(child)
            return lines+[' '*level*2+'}']
        if isinstance(v,list):
            lines=[' '*level*2+'[']
            for i,x in enumerate(v):
                child=compact(x,level+1)
                if i<len(v)-1:child[-1]+=','
                lines.extend(child)
            return lines+[' '*level*2+']']
        return [' '*level*2+flat]
    text='\n'.join(compact(value))
    # Each JSON line is a separate flowable, so even long examples remain printable.
    result=[]
    for line in text.splitlines():
        lead=len(line)-len(line.lstrip())
        q=Paragraph('&nbsp;'*lead+escape(clean(line.lstrip())),styles['code'])
        result.append(q)
    return [KeepTogether(result)]

def schema_fields(s,prefix='',required=None):
    s=resolve(s); rows=[]
    for part in s.get('allOf',[]): rows.extend(schema_fields(part,prefix))
    required=s.get('required',[]) if required is None else required
    for name,v in s.get('properties',{}).items():
        r=resolve(v)
        detail=(('세부 정의: '+typename(v)) if '$ref' in v else r.get('description',''))
        cs=constraints(v if '$ref' in v else r)
        if cs: detail += ('\n' if detail else '')+cs
        if 'example' in r: detail += ('\n' if detail else '')+'예: '+json.dumps(r['example'],ensure_ascii=False)
        rows.append([prefix+name,typename(v),('필수' if name in required else '선택'),detail.replace('\n',' / ') or '-'])
        if 'properties' in v: rows.extend(schema_fields(v,prefix+name+'.'))
    return rows

def chrome(c,doc,title,section,op=None):
    c.saveState()
    c.setFillColor(colors.HexColor(INK));c.setFont('Helvetica-Bold',9)
    c.drawString(M,H-25,"I DON'T KNOW SEOUL")
    c.setFont('KR',8);c.setFillColor(colors.HexColor(MUTED));c.drawRightString(W-M,H-25,section)
    c.setStrokeColor(colors.HexColor(LINE));c.line(M,H-36,W-M,H-36)
    if op:
        method,path,entry=op
        c.setFillColor(colors.HexColor(METHODS[method]));c.setFont('Helvetica-Bold',12)
        c.drawString(M,H-64,method.upper())
        c.setFillColor(colors.HexColor(INK));c.setFont('Helvetica-Bold',17)
        c.drawString(M+65,H-64,path)
        c.setFont('KR',15);c.drawString(M,H-89,entry['summary'])
        auth=auth_label(entry)
        c.setFont('KR',8);c.setFillColor(colors.HexColor(MUTED));c.drawRightString(W-M,H-89,auth+'   /   '+entry['operationId'])
    else:
        c.setFont('KR',24);c.setFillColor(colors.HexColor(INK));c.drawString(M,H-76,title)
    c.setStrokeColor(colors.HexColor(LINE));c.line(M,29,W-M,29)
    c.setFont('KR',7.5);c.setFillColor(colors.HexColor(MUTED));c.drawString(M,17,'PG7반 P211 김기현    /    API 설계 명세 1.0.0')
    c.setFont('Helvetica',8);c.drawRightString(W-M,17,f'{doc.page:02d}')
    c.restoreState()
    key=doc.pageTemplate.id
    if key not in getattr(doc,'seen',set()):
        if not hasattr(doc,'seen'):doc.seen=set()
        doc.seen.add(key);c.bookmarkPage(key)
        c.addOutlineEntry((op[0].upper()+' '+op[1]) if op else title,key,level=0)

class Doc(BaseDocTemplate):
    def afterFlowable(self,f):
        pass

doc=Doc(str(OUT),pagesize=(W,H),title="I Don't Know Seoul / API 설계 명세",author='PG7반 P211 김기현',leftMargin=M,rightMargin=M)
templates=[]
def template(id,title,section,op=None):
    top=H-(111 if op else 102)
    frames=([Frame(M,43,COL,top-43,id=id+'L',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0),Frame(M+COL+GAP,43,COL,top-43,id=id+'R',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)] if op else [Frame(M,43,WIDTH,top-43,id=id,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)])
    t=PageTemplate(id=id,frames=frames,onPage=lambda c,d:chrome(c,d,title,section,op));templates.append(t)

template('cover','API 설계 명세','DOCUMENTATION / 2026.09')
template('index','API 전체 목록','01 / ENDPOINT INDEX')
template('policy','서비스 경계와 인증','02 / CONVENTIONS')
operations=[]
for path,methods in SPEC['paths'].items():
    for method,o in methods.items():
        if method in METHODS: operations.append((method,path,o))
for n,op in enumerate(operations,1): template('op'+str(n),'',f'03 / ENDPOINT {n:02d}',op)
groups=[['Error','WorkerError','AuthUser'],['GeoResponse','GeoResult'],['DataBundle','Dong'],['ReviewPage','HelpfulResult'],['Review'],['ReviewCreate','ReviewUpdate'],['ReviewDestinationInput','ReviewDestination','ReviewRatings']]
for n,g in enumerate(groups,1): template('schema'+str(n),'데이터 스키마',f'04 / SCHEMA REFERENCE {n:02d}')
template('errors','공통 오류 응답','05 / ERROR REFERENCE')
doc.addPageTemplates(templates)
story=[]
def new(id): story.extend([NextPageTemplate(id),PageBreak()])

story += [Spacer(1,34),Paragraph("I Don't<br/>Know Seoul",ParagraphStyle('cover',fontName='Helvetica-Bold',fontSize=53,leading=57,textColor=colors.HexColor(INK))),Spacer(1,18),p('목적지를 기준으로 동네를 비교하고,<br/>실거주 후기로 선택을 돕는 서비스'.replace('<br/>','\n')),Spacer(1,27)]
story += [table(['규격','범위','문서 작성'],[['OpenAPI 3.0.3 / v1.0.0','9 paths / 12 operations / 15 schemas','PG7반 P211 김기현']], [WIDTH*.3,WIDTH*.4,WIDTH*.3]),Spacer(1,18),p('데이터 조회와 목적지 검색, OAuth 로그인, 행정동 후기, 도움돼요 API의 요청과 응답을 정의합니다.'),p('OAuth·후기·도움돼요는 구현 예정인 설계 계약입니다. 기존 데이터·지오코딩 API와 구현 상태를 구분합니다.','small')]
new('index')
rows=[]
for i,(m,path,o) in enumerate(operations,1): rows.append([f'{i:02d}',m.upper(),path,o['summary'],'회원' if auth_label(o)=='로그인 필요' else '공개'])
story += [table(['번호','메서드','경로','기능','인증'],rows,[36,57,WIDTH-350,205,52])]
new('policy')
story += paras(SPEC['info']['description'])
story += [heading('BASE URL'),p(SPEC['servers'][0]['url']+'  /  '+SPEC['servers'][0]['description']),heading('SESSION COOKIE')]
for name,v in SPEC['components']['securitySchemes'].items(): story += [p(name+' / '+v['name']+' / '+v['in']),p(v['description'])]

for i,(m,path,o) in enumerate(operations,1):
    new('op'+str(i))
    story += [heading('동작 및 적용 조건')]+paras(o.get('description',''))
    params=[resolve(v) for v in o.get('parameters',[])]
    if not params: story += [p('요청 파라미터: 없음','small')]
    else: story += [heading('요청 파라미터')]
    for v in params:
        s=resolve(v.get('schema',{}))
        story += [p(v['name']+'  /  '+v['in']+'  /  '+typename(v.get('schema',{}))+'  /  '+('필수' if v.get('required') else '선택')), *paras(v.get('description',''),'small')]
        if constraints(s):story += [p(constraints(s),'small')]
        if 'example' in v: story += [p('예: '+str(v['example']),'small')]
        elif 'example' in s: story += [p('예: '+str(s['example']),'small')]
    body=resolve(o.get('requestBody',{}))
    if not body:story += [p('요청 본문: 없음','small')]
    else:
        story += [heading('요청 본문')]
        story += [p('필수 본문' if body.get('required') else '선택 본문','small')]
        if body.get('description'): story+=paras(body['description'])
        for mime,v in body.get('content',{}).items():
            story += [p(mime+' / '+typename(v.get('schema',{})))]
            rows=schema_fields(v.get('schema',{}))
            if rows: story += [table(['필드','타입 / 필수','조건'],[[r[0],r[1]+' / '+r[2],r[3]] for r in rows],[COL*.29,COL*.26,COL*.45])]
            if 'example' in v: story += [heading('요청 예제')]+code(v['example'])
    if i in [3,5,6,10,11,12]: story += [FrameBreak()]
    story += [heading('응답 상태')]
    rows=[]
    for status,ref in o['responses'].items():
        v=resolve(ref);types=[typename(x.get('schema',{})) for x in v.get('content',{}).values()]
        rows.append([status,v['description']+'\n'+(', '.join(types) if types else '본문 없음')])
    story += [table(['HTTP','응답'],rows,[43,COL-43])]
    for status,ref in o['responses'].items():
        v=resolve(ref)
        if '$ref' in ref: continue
        if v.get('headers'):
            story += [heading(status+' 응답 헤더')]
            for hn,hv in v['headers'].items():
                hv=resolve(hv);story += [p(hn+' / '+typename(hv.get('schema',{}))),p(hv.get('description',''),'small')]
                if constraints(hv.get('schema',{})):story += [p(constraints(hv['schema']),'small')]
                if 'example' in hv:story += [p('예: '+str(hv['example']),'small')]
        for mime,cv in v.get('content',{}).items():
            story += [heading(status+' 응답 본문'),p(mime+' / '+typename(cv.get('schema',{})),'small')]
            if 'example' in cv: story += code(cv['example'])
            for en,ev in cv.get('examples',{}).items():
                ev=resolve(ev);story += [p(ev.get('summary',en),'small')]
                if 'value' in ev:story += code(ev['value'])

for i,group in enumerate(groups,1):
    new('schema'+str(i))
    for name in group:
        s=SPEC['components']['schemas'][name]
        items=[heading(name)]
        if s.get('description'):items += paras(s['description'])
        if constraints(s):items += [p(constraints(s),'small')]
        if 'allOf' in s:
            items += [p('조합 스키마: '+typename(s))]
            for part in s['allOf']:
                if part.get('description'):items+=paras(part['description'])
        rows=schema_fields(s)
        items += [table(['필드','타입','필수','설명 및 제약'],rows,[WIDTH*.19,WIDTH*.18,42,WIDTH*.63-42]),Spacer(1,10)]
        story += [KeepTogether(items)]

new('errors')
for name,ref in SPEC['components']['responses'].items():
    start=len(story)
    v=resolve(ref)
    story += [heading(name),p(v['description'])]
    for hn,hv in v.get('headers',{}).items():
        story += [p(hn+' / '+hv.get('description','')+' / '+str(hv.get('example','')),'small')]
    for mime,cv in v.get('content',{}).items():
        story += [p(mime+' / '+typename(cv.get('schema',{})),'small')]
        if 'example' in cv:story += [p(json.dumps(cv['example'],ensure_ascii=False),'code')]
        for en,ev in cv.get('examples',{}).items():
            ev=resolve(ev);story += [p(ev.get('summary',en),'small')]
            if 'value' in ev:story += code(ev['value'])
    block=story[start:]
    story[start:]=[KeepTogether(block)]
doc.build(story)
print(OUT)
