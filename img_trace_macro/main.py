from tkinter import messagebox
from functools import partial
from PIL import ImageGrab
import time, random
import pyautogui
import gc, os, psutil

# 모든 모니터 체크
ImageGrab.grab = partial(ImageGrab.grab, all_screens=True)


def get_memory_usage():
    # 현재 사용량
    pid = os.getpid()
    current_process = psutil.Process(pid)
    current_process_memory_usage_as_MB = current_process.memory_info()[0] / 2 ** 20
    return current_process_memory_usage_as_MB

def complete_handling(keyward):
    messagebox.showinfo('Process Complete', f'{keyward}이 완료되었습니다.')

def exception_handling(e):
    messagebox.showinfo('Exception handling', f'오류가 발생하였습니다.\n({e})')

# 강의 재생
# def play_lecture():

# 메인 페이지 로딩 및 강의 페이지 열기
# def open_lecture():

# 강의 페이지 오픈 및 재생
# def page_open():
    # open_lecture()
    # play_lecture()

# 타겟 버튼 여부 체크
def click_chk_btn():
    random_wait_time = random.randrange(1, 7)
    check_bool = False
    print_cnt = 0
    fail_cnt = 0
    while True:
        # 화면 체크 - 타겟 버튼
        try:
            chk_location = pyautogui.locateCenterOnScreen('target_img/calc.png')
        except OSError as ose:
            # 스냅샷할 화면이 없을 경우, 3번까지 재확인
            fail_cnt += 1
            if fail_cnt >= 3:
                exception_handling(ose)
                break 
            print(str(ose) + ': Count ' + str(fail_cnt))
        # 타겟이 화면에 있는지 확인
        if chk_location is not None:
            pyautogui.click(chk_location)
            check_bool = True
            print('타겟 성공!')
            # 타겟 후 확인창 로딩 대기
            time.sleep(1)
            pyautogui.press("enter")
            break
        else:
            memory_usage = get_memory_usage()
            print('타겟 대기 중 ... Current memory: ' + f'{memory_usage:5.0f} MB')
            if memory_usage > 300:
                gc.collect()
        # 화면 체크 10번마다 구분선 출력
        print_cnt += 1
        if print_cnt >= 10:
            print_cnt = 0
            print(f'----------------------------({random_wait_time})')
        # 매크로 추적 방지
        time.sleep(random_wait_time)
    return check_bool

# 타겟 이미지 체크
def click_cfm_btn():
    check_bool = False
    # 타겟 이미지 페이지 로딩 대기
    time.sleep(1)
    # 화면 체크 - 타겟 이미지 버튼
    cfm_location = pyautogui.locateCenterOnScreen('target_img/calc_5.png')
    if cfm_location is not None:
        pyautogui.click(cfm_location)
        check_bool = True
        print('타겟 이미지 O')
    else:
        print('타겟 이미지 X')
    return check_bool


if __name__ == '__main__':
    # 강의 자동 재생 매크로
    # try:
    #     page_open()
    # except Exception as e:
    #     exception_handling(e)
    # 강의 자동 타겟 매크로
    try:
        # 타겟 버튼 클릭
        check_bool = click_chk_btn()
        print('-------------------------')
        if check_bool:
            # 타겟 이미지 버튼 클릭
            confirm_bool = click_cfm_btn()
            if confirm_bool:
                complete_handling('타겟체크')
    except Exception as e:
        exception_handling(e)
