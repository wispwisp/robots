from robot import *

while True:
    if distance("front_center") < 15:
        stop()
    elif line("front_left"):
        motors(0, 50)
    elif line("front_right"):
        motors(50, 0)
    else:
        motors(50, 50)
