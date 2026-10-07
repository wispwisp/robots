from robot import *

while True:
    if line("front_left"):
        motors(0, 50)
    elif line("front_right"):
        motors(50, 0)
    else:
        motors(50, 50)
