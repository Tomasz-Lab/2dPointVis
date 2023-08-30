import './style.css'
import * as PIXI from 'pixi.js';
import bindGlobalInput from "./globalInput";
import { onHighlight, onUnhighlight, onNodeClick } from "./lib/listeners";

// constants
const NODE_SIZE = 3;

// create PIXI app
const app = new PIXI.Application({ background: '#0c1b32', resizeTo: window });
document.querySelector('#app').appendChild(app.view);

// Read dots from public/vectors.json
const colors = await fetch('/colors.json').then(res => res.json());

const dots = await fetch('/vectors.json').then(res => res.json());
// optimize above code
const min = Math.min(...dots.map(dot => Math.min(...dot)));
const max = Math.max(...dots.map(dot => Math.max(...dot)));

const range = max - min;
dots.forEach(dot => {
  dot[0] = (dot[0] - min) / range * app.screen.width;
  dot[1] = (dot[1] - min) / range * app.screen.height;
});

const mainGraphics = new PIXI.Graphics();
const highlight = new PIXI.Graphics();

// Draw 2d dots
dots.forEach(dot => {
  const color = colors[parseInt(dot[2])];

  const graphics = new PIXI.Graphics();
  graphics.lineStyle(0);

  graphics.beginFill(0xFFFFFF, 1);
  graphics.tint = color;
  graphics.globalPosition = [dot[0], dot[1]];
  graphics.drawCircle(dot[0], dot[1], NODE_SIZE);
  graphics.endFill();

  graphics.eventMode = 'static';
  graphics.on('mouseover', onHighlight);
  graphics.on('mouseout', onUnhighlight);
  graphics.on('click', onNodeClick(highlight, NODE_SIZE));

  mainGraphics.addChild(graphics);
});

// Create a highlight around a random dot
const randomDot = dots[Math.floor(Math.random() * dots.length)];
highlight.lineStyle(0);
highlight.beginFill(0xFFFFFF, 0.7);
highlight.drawCircle(randomDot[0], randomDot[1], 10);
highlight.endFill();
highlight.beginHole();
highlight.drawCircle(randomDot[0], randomDot[1], NODE_SIZE);
highlight.endHole();
mainGraphics.addChild(highlight);

app.stage.addChild(mainGraphics);

const toBind = {
  domContainer: app.view,
  graphGraphics: mainGraphics,
  stage: app.stage
};

app.stage.eventMode = "dynamic";
bindGlobalInput(toBind);

// Create UI
const ui = new PIXI.Graphics();
ui.lineStyle(0);
ui.beginFill(0xFFFFFF, 0.7);
ui.drawRect(0, 0, 200, 100);
ui.endFill();

const uiText = new PIXI.Text('Click on a dot to highlight it', {
  fontFamily: 'Arial',
  fontSize: 12,
  fill: 0x000000,
  align: 'center'
});
uiText.x = 10;
uiText.y = 10;
ui.addChild(uiText);

app.stage.addChild(ui);