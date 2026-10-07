from robot import *

def forward():
    motors(50, 50)
    wait(1)

def turn(left, right):
    motors(left, right)
    wait(0.5)
    stop()

def clamp(value, limit):
    if value > limit:
        return limit
    return value

def reset():
    global speed
    speed = 0

reset()
forward()
turn(-50, 50)
speed = clamp(120, 100)
motors(clamp(speed, 80), speed)
print(clamp(speed, 30) * 2)
