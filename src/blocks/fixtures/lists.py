from robot import *

speeds = [30, 50, -20]
seen = []
first = speeds[0]
last = speeds[-1]
speeds[1] = first + last
seen.append(color("left"))
seen.append(speeds[len(speeds) - 2])
count = len(seen)
for s in speeds:
    motors(s, s)
    wait(0.5)
for c in ["red", "green"]:
    print(c)
