from robot import *

def turn_left():
    # Spin on the spot
    motors(-50, 50)
    wait(0.3)

# Drive until something is close
while True:
    # Look ahead
    if distance("front_center") < 20:
        turn_left()
        # Turned
    else:
        motors(50, 50)
    # End of the loop body
# The end
