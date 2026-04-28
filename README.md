# NEIS 학교 급식/시간표 (웹)

학교 이름을 검색해서 선택한 뒤, NEIS 오픈API로 **급식**과 **시간표**를 가져오는 간단한 웹 앱입니다.

## 실행

1. Node.js 설치 (권장: 18+)
2. 실행:

```bash
cd neis-school-app
npm run start
```

브라우저에서 `http://localhost:5173` 열기.

## 메모

- NEIS 오픈API는 브라우저에서 직접 호출하면 CORS 문제가 생길 수 있어, 이 프로젝트는 `server.js`가 프록시 역할을 합니다.
- 학교 검색 결과는 브라우저 `localStorage`에 캐시합니다.

