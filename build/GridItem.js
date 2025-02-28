"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _react = _interopRequireDefault(require("react"));
var _propTypes = _interopRequireDefault(require("prop-types"));
var _reactDraggable = require("react-draggable");
var _reactResizable = require("react-resizable");
var _utils = require("./utils");
var _calculateUtils = require("./calculateUtils");
var _ReactGridLayoutPropTypes = require("./ReactGridLayoutPropTypes");
var _clsx = _interopRequireDefault(require("clsx"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
/*:: import type { Element as ReactElement, Node as ReactNode } from "react";*/
/*:: import type {
  ReactDraggableCallbackData,
  GridDragEvent,
  GridResizeEvent,
  DroppingPosition,
  Position,
  ResizeHandleAxis
} from "./utils";*/
/*:: import type { PositionParams } from "./calculateUtils";*/
/*:: import type { ResizeHandle, ReactRef } from "./ReactGridLayoutPropTypes";*/
/*:: type PartialPosition = { top: number, left: number };*/
/*:: type GridItemCallback<Data: GridDragEvent | GridResizeEvent> = (
  i: string,
  w: number,
  h: number,
  Data
) => void;*/
/*:: type ResizeCallbackData = {
  node: HTMLElement,
  size: Position,
  handle: ResizeHandleAxis
};*/
/*:: type GridItemResizeCallback = (
  e: Event,
  data: ResizeCallbackData,
  position: Position
) => void;*/
/*:: type State = {
  resizing: ?{ top: number, left: number, width: number, height: number },
  dragging: ?{ top: number, left: number },
  className: string
};*/
/*:: type Props = {
  children: ReactElement<any>,
  cols: number,
  containerWidth: number,
  margin: [number, number],
  containerPadding: [number, number],
  rowHeight: number,
  maxRows: number,
  isDraggable: boolean,
  isResizable: boolean,
  isBounded: boolean,
  static?: boolean,
  useCSSTransforms?: boolean,
  usePercentages?: boolean,
  transformScale: number,
  droppingPosition?: DroppingPosition,

  className: string,
  style?: Object,
  // Draggability
  cancel: string,
  handle: string,

  x: number,
  y: number,
  w: number,
  h: number,

  minW: number,
  maxW: number,
  minH: number,
  maxH: number,
  i: string,
  delay?: number,

  resizeHandles?: ResizeHandleAxis[],
  resizeHandle?: ResizeHandle,

  onDrag?: GridItemCallback<GridDragEvent>,
  onDragStart?: GridItemCallback<GridDragEvent>,
  onDragStop?: GridItemCallback<GridDragEvent>,
  onResize?: GridItemCallback<GridResizeEvent>,
  onResizeStart?: GridItemCallback<GridResizeEvent>,
  onResizeStop?: GridItemCallback<GridResizeEvent>
};*/
/*:: type DefaultProps = {
  className: string,
  cancel: string,
  handle: string,
  minH: number,
  minW: number,
  maxH: number,
  maxW: number,
  delay?: number,
  transformScale: number
};*/
/**
 * An individual item within a ReactGridLayout.
 */
class GridItem extends _react.default.Component /*:: <Props, State>*/{
  constructor() {
    super(...arguments);
    _defineProperty(this, "state", {
      resizing: null,
      dragging: null,
      className: ""
    });
    _defineProperty(this, "elementRef", /*#__PURE__*/_react.default.createRef());
    _defineProperty(this, "delayInfo", {});
    /**
     * onDragStart event handler
     * @param  {Event}  e             event data
     * @param  {Object} callbackData  an object with node, delta and position information
     */
    _defineProperty(this, "onDragStart", async (e, _ref) => {
      let {
        node
      } = _ref;
      const {
        onDragStart,
        transformScale,
        delay
      } = this.props;
      if (!onDragStart) return;
      if (delay) {
        const result = await new Promise(resolve => {
          this.delayInfo.timer = window.setTimeout(() => {
            resolve(true);
          }, delay);
          this.delayInfo.resolve = resolve;
        });
        if (!result) {
          return;
        }
      }
      const newPosition /*: PartialPosition*/ = {
        top: 0,
        left: 0
      };

      // TODO: this wont work on nested parents
      const {
        offsetParent
      } = node; // node 就是拖拽的元素
      if (!offsetParent) return;
      const parentRect = offsetParent.getBoundingClientRect();
      const clientRect = node.getBoundingClientRect();
      const cLeft = clientRect.left / transformScale;
      const pLeft = parentRect.left / transformScale;
      const cTop = clientRect.top / transformScale;
      const pTop = parentRect.top / transformScale;
      newPosition.left = cLeft - pLeft + offsetParent.scrollLeft;
      newPosition.top = cTop - pTop + offsetParent.scrollTop;
      this.setState({
        dragging: newPosition
      });

      // Call callback with this data
      const {
        x,
        y
      } = (0, _calculateUtils.calcXY)(this.getPositionParams(), newPosition.top, newPosition.left, this.props.w, this.props.h);
      return onDragStart.call(this, this.props.i, x, y, {
        e,
        node,
        newPosition
      });
    });
    /**
     * onDrag event handler
     * @param  {Event}  e             event data
     * @param  {Object} callbackData  an object with node, delta and position information
     */
    _defineProperty(this, "onDrag", (e, _ref2 // node 是拖拽的元素，deltaX、deltaY 是拖拽过程中元素的水平和垂直移动距离
    ) => {
      let {
        node,
        deltaX,
        deltaY
      } = _ref2;
      const {
        onDrag,
        delay
      } = this.props;
      if (!onDrag) return;
      if (!this.state.dragging) {
        if ((deltaX > 2 || deltaY > 2) && Number(delay) > 0) {
          this.clearDelayInfo();
          return;
        }
        throw new Error("onDrag called before onDragStart.");
      }
      let top = this.state.dragging.top + deltaY;
      let left = this.state.dragging.left + deltaX;
      const {
        isBounded,
        i,
        w,
        h,
        containerWidth
      } = this.props;
      const positionParams = this.getPositionParams();

      // Boundary calculations; keeps items within the grid
      if (isBounded) {
        const {
          offsetParent
        } = node;
        if (offsetParent) {
          const {
            margin,
            rowHeight,
            containerPadding
          } = this.props;
          const bottomBoundary = offsetParent.clientHeight - (0, _calculateUtils.calcGridItemWHPx)(h, rowHeight, margin[1]);
          top = (0, _calculateUtils.clamp)(top - containerPadding[1], 0, bottomBoundary);
          const colWidth = (0, _calculateUtils.calcGridColWidth)(positionParams);
          const rightBoundary = containerWidth - (0, _calculateUtils.calcGridItemWHPx)(w, colWidth, margin[0]);
          left = (0, _calculateUtils.clamp)(left - containerPadding[0], 0, rightBoundary);
        }
      }
      const newPosition /*: PartialPosition*/ = {
        top,
        left
      };
      this.setState({
        dragging: newPosition
      });

      // Call callback with this data
      const {
        x,
        y
      } = (0, _calculateUtils.calcXY)(positionParams, top, left, w, h);
      return onDrag.call(this, i, x, y, {
        e,
        node,
        newPosition
      });
    });
    /**
     * onDragStop event handler
     * @param  {Event}  e             event data
     * @param  {Object} callbackData  an object with node, delta and position information
     */
    _defineProperty(this, "onDragStop", (e, _ref3) => {
      let {
        node
      } = _ref3;
      const {
        onDragStop,
        delay
      } = this.props;
      if (!onDragStop) return;
      if (!this.state.dragging) {
        if (Number(delay) > 0) {
          this.clearDelayInfo();
          return;
        }
        throw new Error("onDragEnd called before onDragStart.");
      }
      const {
        w,
        h,
        i
      } = this.props;
      const {
        left,
        top
      } = this.state.dragging;
      const newPosition /*: PartialPosition*/ = {
        top,
        left
      };
      this.setState({
        dragging: null
      });
      const {
        x,
        y
      } = (0, _calculateUtils.calcXY)(this.getPositionParams(), top, left, w, h);
      return onDragStop.call(this, i, x, y, {
        e,
        node,
        newPosition
      });
    });
    /**
     * onResizeStop event handler
     * @param  {Event}  e             event data
     * @param  {Object} callbackData  an object with node and size information
     */
    _defineProperty(this, "onResizeStop", (e, callbackData, position) => this.onResizeHandler(e, callbackData, position, "onResizeStop"));
    // onResizeStart event handler
    _defineProperty(this, "onResizeStart", (e, callbackData, position) => this.onResizeHandler(e, callbackData, position, "onResizeStart"));
    // onResize event handler
    _defineProperty(this, "onResize", (e, callbackData, position) => this.onResizeHandler(e, callbackData, position, "onResize"));
  }
  shouldComponentUpdate(nextProps /*: Props*/, nextState /*: State*/) /*: boolean*/{
    // We can't deeply compare children. If the developer memoizes them, we can
    // use this optimization.
    if (this.props.children !== nextProps.children) return true;
    if (this.props.droppingPosition !== nextProps.droppingPosition) return true;
    // TODO memoize these calculations so they don't take so long?
    const oldPosition = (0, _calculateUtils.calcGridItemPosition)(this.getPositionParams(this.props), this.props.x, this.props.y, this.props.w, this.props.h, this.state);
    const newPosition = (0, _calculateUtils.calcGridItemPosition)(this.getPositionParams(nextProps), nextProps.x, nextProps.y, nextProps.w, nextProps.h, nextState);
    return !(0, _utils.fastPositionEqual)(oldPosition, newPosition) || this.props.useCSSTransforms !== nextProps.useCSSTransforms;
  }
  componentDidMount() {
    this.moveDroppingItem({});
  }
  componentDidUpdate(prevProps /*: Props*/) {
    this.moveDroppingItem(prevProps);
  }

  // When a droppingPosition is present, this means we should fire a move event, as if we had moved
  // this element by `x, y` pixels.
  moveDroppingItem(prevProps /*: Props*/) {
    const {
      droppingPosition
    } = this.props;
    if (!droppingPosition) return;
    const node = this.elementRef.current;
    // Can't find DOM node (are we unmounted?)
    if (!node) return;
    const prevDroppingPosition = prevProps.droppingPosition || {
      left: 0,
      top: 0
    };
    const {
      dragging
    } = this.state;
    const shouldDrag = dragging && droppingPosition.left !== prevDroppingPosition.left || droppingPosition.top !== prevDroppingPosition.top;
    if (!dragging) {
      this.onDragStart(droppingPosition.e, {
        node,
        deltaX: droppingPosition.left,
        deltaY: droppingPosition.top
      });
    } else if (shouldDrag) {
      const deltaX = droppingPosition.left - dragging.left;
      const deltaY = droppingPosition.top - dragging.top;
      this.onDrag(droppingPosition.e, {
        node,
        deltaX,
        deltaY
      });
    }
  }
  getPositionParams() /*: PositionParams*/{
    let props /*: Props*/ = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.props;
    return {
      cols: props.cols,
      // 列数
      containerPadding: props.containerPadding,
      // 容器内边距
      containerWidth: props.containerWidth,
      // 容器宽度
      margin: props.margin,
      // 外边距
      maxRows: props.maxRows,
      // 最大行数
      rowHeight: props.rowHeight // 行高
    };
  }

  /**
   * This is where we set the grid item's absolute placement. It gets a little tricky because we want to do it
   * well when server rendering, and the only way to do that properly is to use percentage width/left because
   * we don't know exactly what the browser viewport is.
   * Unfortunately, CSS Transforms, which are great for performance, break in this instance because a percentage
   * left is relative to the item itself, not its container! So we cannot use them on the server rendering pass.
   *
   * @param  {Object} pos Position object with width, height, left, top.
   * @return {Object}     Style object.
   */
  createStyle(pos /*: Position*/) /*: { [key: string]: ?string }*/{
    const {
      usePercentages,
      containerWidth,
      useCSSTransforms
    } = this.props;
    let style;
    // CSS Transforms support (default)
    if (useCSSTransforms) {
      style = (0, _utils.setTransform)(pos);
    } else {
      // top,left (slow)
      style = (0, _utils.setTopLeft)(pos);

      // This is used for server rendering.
      if (usePercentages) {
        style.left = (0, _utils.perc)(pos.left / containerWidth);
        style.width = (0, _utils.perc)(pos.width / containerWidth);
      }
    }
    return style;
  }

  /**
   * Mix a Draggable instance into a child.
   * @param  {Element} child    Child element.
   * @return {Element}          Child wrapped in Draggable.
   */
  mixinDraggable(child /*: ReactElement<any>*/, isDraggable /*: boolean*/) /*: ReactElement<any>*/{
    return /*#__PURE__*/_react.default.createElement(_reactDraggable.DraggableCore, {
      disabled: !isDraggable,
      onStart: this.onDragStart // 计算top、left、设置到 dragging 数据中，计算 x、y 调用 props 中的 onDragStart
      ,
      onDrag: this.onDrag,
      onStop: this.onDragStop,
      handle: this.props.handle,
      cancel: ".react-resizable-handle" + (this.props.cancel ? "," + this.props.cancel : ""),
      scale: this.props.transformScale,
      nodeRef: this.elementRef
    }, child);
  }

  /**
   * Utility function to setup callback handler definitions for
   * similarily structured resize events.
   */
  curryResizeHandler(position /*: Position*/, handler /*: Function*/) /*: Function*/{
    return (e /*: Event*/, data /*: ResizeCallbackData*/) => /*: Function*/handler(e, data, position);
  }

  /**
   * Mix a Resizable instance into a child.
   * @param  {Element} child    Child element.
   * @param  {Object} position  Position object (pixel values)
   * @return {Element}          Child wrapped in Resizable.
   */
  mixinResizable(child /*: ReactElement<any>*/, position /*: Position*/, isResizable /*: boolean*/) /*: ReactElement<any>*/{
    const {
      cols,
      minW,
      minH,
      maxW,
      maxH,
      transformScale,
      resizeHandles,
      resizeHandle
    } = this.props;
    const positionParams = this.getPositionParams();

    // This is the max possible width - doesn't go to infinity because of the width of the window
    const maxWidth = (0, _calculateUtils.calcGridItemPosition)(positionParams, 0, 0, cols, 0).width;

    // Calculate min/max constraints using our min & maxes
    const mins = (0, _calculateUtils.calcGridItemPosition)(positionParams, 0, 0, minW, minH);
    const maxes = (0, _calculateUtils.calcGridItemPosition)(positionParams, 0, 0, maxW, maxH);
    const minConstraints = [mins.width, mins.height];
    const maxConstraints = [Math.min(maxes.width, maxWidth), Math.min(maxes.height, Infinity)];
    return /*#__PURE__*/_react.default.createElement(_reactResizable.Resizable
    // These are opts for the resize handle itself
    , {
      draggableOpts: {
        disabled: !isResizable
      },
      className: isResizable ? undefined : "react-resizable-hide",
      width: position.width,
      height: position.height,
      minConstraints: minConstraints,
      maxConstraints: maxConstraints,
      onResizeStop: this.curryResizeHandler(position, this.onResizeStop),
      onResizeStart: this.curryResizeHandler(position, this.onResizeStart),
      onResize: this.curryResizeHandler(position, this.onResize),
      transformScale: transformScale,
      resizeHandles: resizeHandles,
      handle: resizeHandle
    }, child);
  }
  clearDelayInfo() {
    if (!this.delayInfo) return;
    window.clearTimeout(this.delayInfo?.timer);
    this.delayInfo?.resolve(false);
  }
  /**
   * Wrapper around resize events to provide more useful data.
   */
  onResizeHandler(e /*: Event*/, _ref4 /*:: */,
  // 'size' is updated position
  position /*: Position*/,
  // existing position
  handlerName /*: string*/) /*: void*/{
    let {
      node,
      size,
      handle
    } /*: ResizeCallbackData*/ = _ref4 /*: ResizeCallbackData*/;
    const handler = this.props[handlerName];
    if (!handler) return;
    const {
      x,
      y,
      i,
      maxH,
      minH,
      containerWidth
    } = this.props;
    const {
      minW,
      maxW
    } = this.props;

    // Clamping of dimensions based on resize direction
    let updatedSize = size;
    if (node) {
      updatedSize = (0, _utils.resizeItemInDirection)(handle, position, size, containerWidth);
      this.setState({
        resizing: handlerName === "onResizeStop" ? null : updatedSize
      });
    }

    // Get new XY based on pixel size
    let {
      w,
      h
    } = (0, _calculateUtils.calcWH)(this.getPositionParams(), updatedSize.width, updatedSize.height, x, y, handle);

    // Min/max capping.
    // minW should be at least 1 (TODO propTypes validation?)
    w = (0, _calculateUtils.clamp)(w, Math.max(minW, 1), maxW);
    h = (0, _calculateUtils.clamp)(h, minH, maxH);
    handler.call(this, i, w, h, {
      e,
      node,
      size: updatedSize,
      handle
    });
  }
  render() /*: ReactNode*/{
    const {
      x,
      y,
      w,
      h,
      isDraggable,
      isResizable,
      droppingPosition,
      useCSSTransforms
    } = this.props;
    const pos = (0, _calculateUtils.calcGridItemPosition)(this.getPositionParams(), x, y, w, h, this.state);
    const child = _react.default.Children.only(this.props.children);

    // Create the child element. We clone the existing element but modify its className and style.
    let newChild = /*#__PURE__*/_react.default.cloneElement(child, {
      ref: this.elementRef,
      className: (0, _clsx.default)("react-grid-item", child.props.className, this.props.className, {
        static: this.props.static,
        resizing: Boolean(this.state.resizing),
        "react-draggable": isDraggable,
        "react-draggable-dragging": Boolean(this.state.dragging),
        dropping: Boolean(droppingPosition),
        cssTransforms: useCSSTransforms
      }),
      // We can set the width and height on the child, but unfortunately we can't set the position.
      style: {
        ...this.props.style,
        ...child.props.style,
        ...this.createStyle(pos)
      }
    });

    // Resizable support. This is usually on but the user can toggle it off.
    newChild = this.mixinResizable(newChild, pos, isResizable);

    // Draggable support. This is always on, except for with placeholders.
    newChild = this.mixinDraggable(newChild, isDraggable);
    return newChild;
  }
}
exports.default = GridItem;
_defineProperty(GridItem, "propTypes", {
  // Children must be only a single element
  children: _propTypes.default.element,
  // General grid attributes
  cols: _propTypes.default.number.isRequired,
  containerWidth: _propTypes.default.number.isRequired,
  rowHeight: _propTypes.default.number.isRequired,
  margin: _propTypes.default.array.isRequired,
  maxRows: _propTypes.default.number.isRequired,
  containerPadding: _propTypes.default.array.isRequired,
  // These are all in grid units
  x: _propTypes.default.number.isRequired,
  y: _propTypes.default.number.isRequired,
  w: _propTypes.default.number.isRequired,
  h: _propTypes.default.number.isRequired,
  // All optional
  minW: function (props /*: Props*/, propName /*: string*/) {
    const value = props[propName];
    if (typeof value !== "number") return new Error("minWidth not Number");
    if (value > props.w || value > props.maxW) return new Error("minWidth larger than item width/maxWidth");
  },
  maxW: function (props /*: Props*/, propName /*: string*/) {
    const value = props[propName];
    if (typeof value !== "number") return new Error("maxWidth not Number");
    if (value < props.w || value < props.minW) return new Error("maxWidth smaller than item width/minWidth");
  },
  minH: function (props /*: Props*/, propName /*: string*/) {
    const value = props[propName];
    if (typeof value !== "number") return new Error("minHeight not Number");
    if (value > props.h || value > props.maxH) return new Error("minHeight larger than item height/maxHeight");
  },
  maxH: function (props /*: Props*/, propName /*: string*/) {
    const value = props[propName];
    if (typeof value !== "number") return new Error("maxHeight not Number");
    if (value < props.h || value < props.minH) return new Error("maxHeight smaller than item height/minHeight");
  },
  // ID is nice to have for callbacks
  i: _propTypes.default.string.isRequired,
  // Resize handle options
  resizeHandles: _ReactGridLayoutPropTypes.resizeHandleAxesType,
  resizeHandle: _ReactGridLayoutPropTypes.resizeHandleType,
  // Functions
  onDragStop: _propTypes.default.func,
  onDragStart: _propTypes.default.func,
  onDrag: _propTypes.default.func,
  onResizeStop: _propTypes.default.func,
  onResizeStart: _propTypes.default.func,
  onResize: _propTypes.default.func,
  // Flags
  isDraggable: _propTypes.default.bool.isRequired,
  isResizable: _propTypes.default.bool.isRequired,
  isBounded: _propTypes.default.bool.isRequired,
  static: _propTypes.default.bool,
  delay: _propTypes.default.number,
  // Use CSS transforms instead of top/left
  useCSSTransforms: _propTypes.default.bool.isRequired,
  transformScale: _propTypes.default.number,
  // Others
  className: _propTypes.default.string,
  // Selector for draggable handle
  handle: _propTypes.default.string,
  // Selector for draggable cancel (see react-draggable)
  cancel: _propTypes.default.string,
  // Current position of a dropping element
  droppingPosition: _propTypes.default.shape({
    e: _propTypes.default.object.isRequired,
    left: _propTypes.default.number.isRequired,
    top: _propTypes.default.number.isRequired
  })
});
_defineProperty(GridItem, "defaultProps", {
  delay: undefined,
  className: "",
  cancel: "",
  handle: "",
  minH: 1,
  minW: 1,
  maxH: Infinity,
  maxW: Infinity,
  transformScale: 1
});