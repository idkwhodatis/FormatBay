These are synthetic 32x32 black-frame test inputs; no external media.
They exercise the release's VP8 (WebM) and Theora (OGV) remux-only targets.
The bundled build can decode these but does not have either encoder. Recreate
with an FFmpeg development build that includes libvpx and libtheora:

    ffmpeg -f lavfi -i color=s=32x32:r=5:d=0.4 -c:v libvpx -an -fflags +bitexact -flags:v +bitexact copy.webm
    ffmpeg -f lavfi -i color=s=32x32:r=5:d=0.4 -c:v libtheora -an -fflags +bitexact -flags:v +bitexact copy.ogv
