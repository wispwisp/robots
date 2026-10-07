from robot import *

if line("front_left"):
    motors(0, 50)
elif line("front_right"):
    motors(50, 0)
else:
    motors(50, 50)
for _ in range(3):
    wait(1)
for i in range(5):
    print(i)
for i in range(2, 5):
    print(i)
for i in range(10, 0, -2):
    print(i)
for ch in "abc":
    print(ch)
n = 0
while n < 10:
    n += 1
    if n == 3:
        continue
    if n >= 8 and n != 9:
        break
while True:
    if not line("front_center") or distance("front_center") <= 20:
        stop()
    elif brightness("left") > 50 and n > 0 and True:
        n -= 1
    else:
        found = False
