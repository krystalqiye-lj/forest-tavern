"""Make a seamless, level-matched loop from the stereo recording.
See waterfall-credit.txt for the original author and license.
"""
import array
import math
import sys
import wave

with wave.open(sys.argv[1], 'rb') as source:
    rate, channels = source.getframerate(), source.getnchannels()
    samples = array.array('h', source.readframes(source.getnframes()))

# Trim the start and end. Wrap the tail into the opening at constant power.
trim = round(rate * .8)
fade = round(rate * 1.9)
end = len(samples) // channels - trim
loop = samples[(trim + fade) * channels:end * channels]
for frame in range(fade):
    blend = frame / (fade - 1)
    a = math.cos(math.pi * blend / 2)
    b = math.sin(math.pi * blend / 2)
    for channel in range(channels):
        at = ((end - trim - fade * 2 + frame) * channels + channel)
        first = (trim + frame) * channels + channel
        loop[at] = max(-32768, min(32767, int(loop[at] * a + samples[first] * b)))

mean_square = sum(value * value for value in loop) / len(loop)
rms = math.sqrt(mean_square) / 32768
gain = min(10 ** (-18 / 20) / rms, .94 * 32768 / max(map(abs, loop)))
loop = array.array('h', (int(v * gain) for v in loop))
with wave.open(sys.argv[2], 'wb') as output:
    output.setparams((channels, 2, rate, 0, 'NONE', ''))
    output.writeframes(loop.tobytes())
