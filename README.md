# Astrology Guessr (name pending)

## Processing Videos

Please use `experiments.ipynb`. Video must be stored as a list of JPEG frames with filenames like `<frame_index>.jpg`.

For your custom videos, you can extract their JPEG frames using `ffmpeg` (https://ffmpeg.org/) as follows:

```bash
ffmpeg -i <your_video>.mp4 -q:v 2 -start_number 0 <output_dir>/'%05d.jpg'
```

where `-q:v` generates high-quality JPEG frames and `-start_number 0` asks `ffmpeg` to start the JPEG file from `00000.jpg`.

