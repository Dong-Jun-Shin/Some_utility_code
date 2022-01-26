# 현재 디렉토리의 하위 파일들 이름 변경
import os

FILE_PATH = 'D:/Downloads/'
FILE_NAMES = os.walk(FILE_PATH)
# now_name : [0]현재 경로, [1]현재 경로의 폴더, [2]현재 경로의 파일
for now_name in FILE_NAMES:
    for file in now_name[2]:
        # 바꿀 이름에 대한 처리
        change_name = file.replace('바꿀 글자', '바뀐 후 글자')
        # 경로 + 파일명
        now_file = os.path.join(now_name[0], file)
        change_file = os.path.join(now_name[0], change_name)
        # 파일에 대한 이름 변경
        os.rename(now_file, change_file)
        print(change_name)
