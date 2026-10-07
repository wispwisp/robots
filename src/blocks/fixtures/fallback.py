from robot import *

def setup():
    def helper():
        stop()
    helper()

import random
class Robot:
    speed = 50
d = {"a": 1}
squares = [n * n for n in range(5)]
try:
    wait(1)
except Exception:
    stop()
xs = [3, 1, 2]
xs.sort()
print(xs, d)
n = 3
while n > 0:
    n -= 1
else:
    setup()
