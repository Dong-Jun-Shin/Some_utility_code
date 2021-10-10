# 이름 변경
import os

FILE_PATH = 'D:/Downloads/'
FILE_NAMES = os.listdir(FILE_PATH)
for now_name in FILE_NAMES:
    change_names = now_name.split(' ', 1)
    change_name = change_names[1].replace('[', '(').replace(']', ')')
    os.rename(os.path.join(FILE_PATH, now_name), os.path.join(FILE_PATH, change_name))
    print(change_name)
