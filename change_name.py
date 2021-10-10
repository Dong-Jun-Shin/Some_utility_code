# 이름 변경
import os

FILE_PATH = 'D:/Downloads/'
FILE_NAMES = os.listdir(FILE_PATH)
for now_name in FILE_NAMES:
    # 바꿀 이름에 대한 처리
    change_name = now_name
    # 경로 + 파일명
    now_file = os.path.join(FILE_PATH, now_name)
    change_file = os.path.join(FILE_PATH, change_name)
    # 파일에 대한 이름 변경
    os.rename(now_file, change_file)
    print(change_name)
