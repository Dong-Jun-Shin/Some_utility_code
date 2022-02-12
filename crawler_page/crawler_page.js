const axios = require('axios');
const fs = require('fs');

async function testAxios(){
    const searchResp = await axios.get('https://www.hira.or.kr/co/search.do?collection=news_new&category=&startCount=0&realQuery=ATC+%EC%BD%94%EB%93%9C+%EC%8B%A0%EA%B7%9C+%EB%B3%80%EA%B2%BD&tapMoveCheck=1&categoryFlag=n&categoryValue=&categoryName=&query=ATC+%EC%BD%94%EB%93%9C+%EC%8B%A0%EA%B7%9C+%EB%B3%80%EA%B2%BD&checkSearchFields=ALL&period=A&startDate=&endDate=&sort=DESC&cookieonoff=on');
    const hira_html = searchResp.data;
    const p_exp = /(goFileDown)(.{0,10}?)((atc code|atc list).+?);/gi;
    const down_list = hira_html.match(p_exp);
    const downUrl = getDownUrl(down_list[0]);
    const downResp = await axios.get(downUrl, {responseType: 'stream'});

    const zipfile = './test.zip';
    fs.existsSync(zipfile) && fs.truncateSync(zipfile)
    downResp.data.pipe(fs.createWriteStream(zipfile));

    // TODO zip 파일 안에서 ATC 코드 부여 전체목록 파일 꺼내서 위치시키기
    // TODO zip 파일 삭제
}

function getDownUrl(target){
    target = target.replace(/goFileDown\(/g, '').replace(/\);/g, '').replace(/'/g, '');
    target = target.split(', ');

    let url = 'https://www.hira.or.kr/download.do?';
    const p_fnm = encodeURIComponent(target[0]);
    const p_src = encodeURIComponent(target[1]);
    url += `src=${p_src}&`;
    url += `fnm=${p_fnm}`;

    return url;
}

testAxios();
