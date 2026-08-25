---
"hazumi": patch
---

`findGrid` keeps the last cell of a band when the art inside it stops short.

A cell is only as long as the ink in it, so a tile drawn 23 pixels wide in a
24-pixel cell ends its band a pixel early — and the old condition, which
required a whole cell to fit inside the band, threw that cell away. On the ORYX
dungeon sheet it lost a column of 53 tiles and a row of 40: real art, never
shown, with nothing to say it was missing.

The walk now covers the band's extent rather than the cells that fit inside it.
The trade runs the other way: a band too small to hold one cell yields one
anchored where its ink starts, which recovers a seven-pixel sprite in an
eight-pixel cell and hands a stray speck a box it does not deserve. That is the
better error for a tool whose whole job is to tell you what is on the sheet —
a wrong box is visible, a missing one is not.

Measured across the five sample sheets: dungeon 2067 to 2214 frames, creatures
324 to 450, interface 120 to 153, ships 70 to 90, projectiles 36 to 60.
