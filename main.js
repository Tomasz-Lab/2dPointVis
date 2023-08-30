import './style.css'
import * as PIXI from 'pixi.js';
import bindGlobalInput from "./globalInput";

const app = new PIXI.Application({ background: '#0c1b32', resizeTo: window });
document.querySelector('#app').appendChild(app.view);

// Read dots from public/vectors.json
const dots = await fetch('/vectors.json').then(res => res.json());
const min = Math.min(...dots.flat());
const max = Math.max(...dots.flat());
const range = max - min;
dots.forEach(dot => {
  dot[0] = (dot[0] - min) / range * app.screen.width;
  dot[1] = (dot[1] - min) / range * app.screen.height;
});

// Draw 2d dots
const graphics = new PIXI.Graphics();
graphics.lineStyle(0);
graphics.beginFill(0xFFFF0B, 0.5);
dots.forEach(dot => {
  graphics.drawCircle(dot[0], dot[1], 1);
});
graphics.endFill();

const toBind = {
  domContainer: app.view,
  graphGraphics: graphics,
  stage: app.stage
};

app.stage.eventMode = "dynamic";
bindGlobalInput(toBind);

app.stage.addChild(graphics);