from robot import *

red_done = False
while True:
    if not red_done and color("right") == "red":
        motors(50, 50)
        wait(0.6)
        stop()
        wait(2.5)
        red_done = True
    elif distance("front_center") < 15:
        stop()
    elif line("front_left"):
        motors(0, 50)
    elif line("front_right"):
        motors(50, 0)
    else:
        motors(50, 50)
