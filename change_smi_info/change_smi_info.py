# 자막 싱크와 폰트 컬러 변경
import re

BEFORE_FILE_PATH = 'D:/1.smi'
AFTER_FILE_PATH = 'D:/2.smi'
PLAY_TIME_REGEX = r"(?!Start=)(\d)+(?=>)"
FONT_COLOR_REGEX = r"(?:color=)([#-]?[\w\d])*(?=>)"
ADD_MILLI_SECONDS = 3100        # milli seconds
CHANGE_FONT_COLOR = "#FFFFFF"   # css color

# READ FILE TYPE(UTF-8)
before_file = open(BEFORE_FILE_PATH, "r")
after_file = open(AFTER_FILE_PATH, "w")
# READ FILE TYPE(CP949)
# before_file = open(BEFORE_FILE_PATH, "r", encoding="utf-8")
# after_file = open(AFTER_FILE_PATH, "w", encoding="utf-8")


while True:
    line = before_file.readline()

    if not line:
        break

    match_time_line = re.search(PLAY_TIME_REGEX, line)
    if match_time_line is not None:
        before_target_time = int(match_time_line.group())
        after_target_time = before_target_time + ADD_MILLI_SECONDS
        line = line.replace(str(before_target_time), str(after_target_time))

    match_color_line = re.search(FONT_COLOR_REGEX, line)
    if match_color_line is not None:
        before_target_color = match_color_line.group().replace("color=", "")
        line = line.replace(before_target_color, CHANGE_FONT_COLOR)

    after_file.write(line)

after_file.close()
before_file.close()
