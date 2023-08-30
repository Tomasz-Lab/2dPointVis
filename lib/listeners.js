export function onHighlight() {
    this.originalColor = this.tint;
    this.tint = 0xFFFFFF;
  }
  
export function onUnhighlight() {
    this.tint = this.originalColor;
  }
  
export function onNodeClick(highlight, NODE_SIZE) {
    return function _inner() {
        highlight.clear();
        highlight.lineStyle(0);
        highlight.beginFill(0xFFFFFF, 0.7);
        highlight.drawCircle(this.globalPosition[0], this.globalPosition[1], 10);
        highlight.endFill();
        highlight.beginHole();
        highlight.drawCircle(this.globalPosition[0], this.globalPosition[1], NODE_SIZE);
        highlight.endHole();
    }
}