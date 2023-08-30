import addWheelListener from "./lib/addWheelListener";
import * as PIXI from 'pixi.js';
import { InteractionData } from "@pixi/interaction";

export default function fun(graphics) {
    var graphGraphics = graphics.graphGraphics;
  
    addWheelListener(graphics.domContainer, function (e) {
      e.preventDefault();
      zoom(e.clientX, e.clientY, e.deltaY < 0);
    });
  
    addDragNDrop();
  
    var getGraphCoordinates = (function () {
      var ctx = {
        global: { x: 0, y: 0} // store it inside closure to avoid GC pressure
      };
  
      return function (x, y) {
        ctx.global.x = x; ctx.global.y = y;
        return InteractionData.prototype.getLocalPosition.call(ctx, graphGraphics);
      }
    }());
  
    function zoom(x, y, isZoomIn) {
      const direction = isZoomIn ? 1 : -1;
      var factor = (1 - direction * 0.05);
      graphGraphics.scale.x *= factor;
      graphGraphics.scale.y *= factor;
  
      // Technically code below is not required, but helps to zoom on mouse
      // cursor, instead center of graphGraphics coordinates
      var beforeTransform = getGraphCoordinates(x, y);
      graphGraphics.updateTransform();
      var afterTransform = getGraphCoordinates(x, y);
  
      graphGraphics.position.x += (afterTransform.x - beforeTransform.x) * graphGraphics.scale.x;
      graphGraphics.position.y += (afterTransform.y - beforeTransform.y) * graphGraphics.scale.y;
      graphGraphics.updateTransform();
    }
  
    function addDragNDrop() {
      var stage = graphics.domContainer;
  
      var isDragging = false,
          prevX, prevY;
  
      stage.onmousedown = function (moveData) {
        var pos = moveData;
        prevX = pos.clientX; prevY = pos.clientY;
        isDragging = true;
      };
  
      stage.onmousemove = function (moveData) {
        if (!isDragging) {
          return;
        }
        var pos = moveData;
        var dx = pos.clientX - prevX;
        var dy = pos.clientY - prevY;
  
        graphGraphics.position.x += dx;
        graphGraphics.position.y += dy;

        prevX = pos.x; prevY = pos.y;
      };
  
      stage.onmouseup = function (moveDate) {
        isDragging = false;
      };
    }
  }