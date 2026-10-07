from robot import *

motors(50, -50)
wait(0.5)
stop()
on_line = line("front_left")
light = brightness("front_center")
gap = distance("front_right")
seen = color("left")
if color("right") == "red":
    stop()
while "green" != color("left"):
    motors(30, 30)
print("red")
