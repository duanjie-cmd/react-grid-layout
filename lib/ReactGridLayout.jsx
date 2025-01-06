// @flow
import * as React from "react";

import { deepEqual } from "fast-equals";
import clsx from "clsx";
import {
  bottom,
  childrenEqual,
  cloneLayoutItem,
  compact,
  compactType,
  fastRGLPropsEqual,
  getAllCollisions,
  getLayoutItem,
  getScreenSize,
  left,
  moveElement,
  noop,
  right,
  synchronizeLayoutWithChildren,
  top,
  withLayoutItem,
} from "./utils";

import {
  calcGridColWidth,
  calcGridItemPosition,
  calcXY,
} from "./calculateUtils";

import GridItem from "./GridItem";
import ReactGridLayoutPropTypes from "./ReactGridLayoutPropTypes";
import type {
  ChildrenArray as ReactChildrenArray,
  Element as ReactElement
} from "react";

// Types
import type {
  CompactType,
  GridResizeEvent,
  GridDragEvent,
  DragOverEvent,
  Layout,
  DroppingPosition,
  LayoutItem
} from "./utils";

import type { PositionParams } from "./calculateUtils";

type State = {
  activeDrag: ?LayoutItem,
  layout: Layout,
  mounted: boolean,
  oldDragItem: ?LayoutItem,
  oldLayout: ?Layout,
  oldResizeItem: ?LayoutItem,
  resizing: boolean,
  droppingDOMNode: ?ReactElement<any>,
  droppingPosition?: DroppingPosition,
  // Mirrored props
  children: ReactChildrenArray<ReactElement<any>>,
  compactType?: CompactType,
  propsLayout?: Layout,
  isDragOverTop: boolean,
  isDragOverBottom: boolean,
  isDragOverLeft: boolean,
  isDragOverRight: boolean
};

import type { Props, DefaultProps } from "./ReactGridLayoutPropTypes";

// End Types

const layoutClassName = "react-grid-layout";
let isFirefox = false;
// Try...catch will protect from navigator not existing (e.g. node) or a bad implementation of navigator
try {
  isFirefox = /firefox/i.test(navigator.userAgent);
} catch (e) {
  /* Ignore */
}

const RollingReservationDistance = 10;
/**
 * A reactive, fluid grid layout with draggable, resizable components.
 */
export default class ReactGridLayout extends React.Component<Props, State> {
  // TODO publish internal ReactClass displayName transform
  static displayName: ?string = "ReactGridLayout";

  // Refactored to another module to make way for preval
  static propTypes = ReactGridLayoutPropTypes;

  static defaultProps: DefaultProps = {
    drayOverBoundary: 10,
    initContainer: {
      width: getScreenSize().width,
      height: getScreenSize().height,
    },
    autoSize: true,
    cols: 12,
    className: "",
    style: {},
    draggableHandle: "",
    draggableCancel: "",
    containerPadding: null,
    rowHeight: 150,
    maxRows: Infinity, // infinite vertical growth
    layout: [],
    margin: [10, 10],
    isBounded: false,
    isDraggable: true,
    isResizable: true,
    allowOverlap: false,
    collisionOnDrop: false,
    isDroppable: false,
    useCSSTransforms: true,
    transformScale: 1,
    verticalCompact: true,
    compactType: "vertical",
    preventCollision: false,
    delay: undefined,
    droppingItem: {
      i: "__dropping-elem__",
      h: 1,
      w: 1
    },
    resizeHandles: ["se"],
    onLayoutChange: noop,
    onDragStart: noop,
    onDrag: noop,
    onDragStop: noop,
    onResizeStart: noop,
    onResize: noop,
    onResizeStop: noop,
    onDrop: noop,
    onDropDragOver: noop
  };

  state: State = {
    activeDrag: null,
    layout: synchronizeLayoutWithChildren(
      this.props.layout,
      this.props.children,
      this.props.cols,
      // Legacy support for verticalCompact: false
      compactType(this.props),
      this.props.allowOverlap
    ),
    mounted: false,
    oldDragItem: null,
    oldLayout: null,
    oldResizeItem: null,
    resizing: false,
    droppingDOMNode: null,
    children: [],
    isDragOverTop: false,
    isDragOverBottom: false,
    isDragOverLeft: false,
    isDragOverRight: false,
  };

  dragEnterCounter: number = 0;

  static getDerivedStateFromProps(
    nextProps: Props,
    prevState: State
  ): $Shape<State> | null {
    let newLayoutBase;

    if (prevState.activeDrag) {
      return null;
    }

    // Legacy support for compactType
    // Allow parent to set layout directly.
    if (
      !deepEqual(nextProps.layout, prevState.propsLayout) ||
      nextProps.compactType !== prevState.compactType
    ) {
      newLayoutBase = nextProps.layout;
    } else if (!childrenEqual(nextProps.children, prevState.children)) {
      // If children change, also regenerate the layout. Use our state
      // as the base in case because it may be more up to date than
      // what is in props.
      newLayoutBase = prevState.layout;
    }

    // We need to regenerate the layout.
    let compactOverlap = nextProps.allowOverlap;
    if (nextProps.collisionOnDrop) {
      compactOverlap = false;
    }
    if (newLayoutBase) {
      const newLayout = synchronizeLayoutWithChildren(
        newLayoutBase,
        nextProps.children,
        nextProps.cols,
        compactType(nextProps),
        compactOverlap
      );

      return {
        layout: newLayout,
        // We need to save these props to state for using
        // getDerivedStateFromProps instead of componentDidMount (in which we would get extra rerender)
        compactType: nextProps.compactType,
        children: nextProps.children,
        propsLayout: nextProps.layout
      };
    }

    return null;
  }

  componentDidMount () {
    this.setState({ mounted: true });
    // Possibly call back with layout on mount. This should be done after correcting the layout width
    // to ensure we don't rerender with the wrong width.
    this.onLayoutMaybeChanged(this.state.layout, this.props.layout);
  }

  shouldComponentUpdate(nextProps: Props, nextState: State): boolean {
    return (
      // NOTE: this is almost always unequal. Therefore the only way to get better performance
      // from SCU is if the user intentionally memoizes children. If they do, and they can
      // handle changes properly, performance will increase.
      this.props.children !== nextProps.children ||
      !fastRGLPropsEqual(this.props, nextProps, deepEqual) ||
      this.state.activeDrag !== nextState.activeDrag ||
      this.state.mounted !== nextState.mounted ||
      this.state.droppingPosition !== nextState.droppingPosition
    );
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (!this.state.activeDrag) {
      const newLayout = this.state.layout;
      const oldLayout = prevState.layout;
      this.onLayoutMaybeChanged(newLayout, oldLayout);
    }
  }

  /**
   * Calculates a pixel value for the container.
   * @return {String} Container height in pixels.
   */
  containerHeight(): ?number {
    if (!this.props.autoSize) return;
    const nbRow = bottom(this.state.layout);
    const containerPaddingY = this.props.containerPadding
      ? this.props.containerPadding[1]
      : this.props.margin[1];
    return (
      nbRow * this.props.rowHeight +
      (nbRow - 1) * this.props.margin[1] +
      containerPaddingY * 2
    );
  }

  /**
   * Calculates a pixel value for the container.
   * @return {String} Container height in pixels.
   */
  containerWidth(): ?number {
    if (!this.props.autoSize) return;
    const nbColumn= right(this.state.layout);
    const containerPaddingX = this.props.containerPadding
      ? this.props.containerPadding[0]
      : this.props.margin[0];
    const {
      margin,
      cols,
      rowHeight,
      maxRows,
      width,
      containerPadding,
    } = this.props;
    const positionParams: PositionParams = {
      cols,
      margin,
      maxRows,
      rowHeight,
      containerWidth: width,
      containerPadding: containerPadding || margin
    };
    const colWidth = calcGridColWidth(positionParams);
    return (
      nbColumn * colWidth+
      (nbColumn - 1) * this.props.margin[0] +
      containerPaddingX * 2
    );
  }

  /**
   * When dragging starts
   * @param {String} i Id of the child
   * @param {Number} x X position of the move
   * @param {Number} y Y position of the move
   * @param {Event} e The mousedown event
   * @param {Element} node The current dragging DOM element
   */
  onDragStart: (i: string, x: number, y: number, GridDragEvent) => void = (
    i: string,
    x: number,
    y: number,
    { e, node }: GridDragEvent
  ) => {
    const { layout } = this.state;
    const l = getLayoutItem(layout, i);
    if (!l) return;

    // Create placeholder (display only)
    const placeholder = {
      w: l.w,
      h: l.h,
      x: l.x,
      y: l.y,
      placeholder: true,
      i: i
    };

    this.setState({
      oldDragItem: cloneLayoutItem(l),
      oldLayout: layout, // todo 写法优化，这里需要深拷贝，使用lodash,JSON.parse(JSON.stringify(layout))
      activeDrag: placeholder
    });

    return this.props.onDragStart(layout, l, l, null, e, node);
  };

  /**
   * Each drag movement create a new dragelement and move the element to the dragged location
   * @param {String} i Id of the child
   * @param {Number} x X position of the move
   * @param {Number} y Y position of the move
   * @param {Event} e The mousedown event
   * @param {Element} node The current dragging DOM element
   */
  onDrag: (i: string, x: number, y: number, GridDragEvent) => void = (
    i,
    x,
    y,
    { e, node }
  ) => {
    const { oldDragItem } = this.state;
    let { layout } = this.state;
    const { cols, allowOverlap, preventCollision } = this.props;
    const l = getLayoutItem(layout, i);
    if (!l) return;

    // Create placeholder (display only)
    const placeholder = {
      w: l.w,
      h: l.h,
      x: l.x,
      y: l.y,
      placeholder: true,
      i: i
    };

    // Move the element to the dragged location.
    const isUserAction = true;
    // 碰撞检测，移动相关元素的逻辑
    layout = moveElement(
      layout,
      l,
      x,
      y,
      isUserAction,
      preventCollision,
      compactType(this.props),
      cols,
      allowOverlap
    );

    this.props.onDrag(layout, oldDragItem, l, placeholder, e, node);

    this.setState({
      layout: allowOverlap
        ? layout
        : compact(layout, compactType(this.props), cols), // 如果不允许重叠，调整layout的元素
      activeDrag: placeholder
    });
  };


  getPositionParams(props: Props = this.props): PositionParams {
    return {
      cols: props.cols, // 列数
      containerPadding: props.containerPadding || props.margin, // 容器内边距
      containerWidth: props.width, // 容器宽度
      margin: props.margin, // 外边距
      maxRows: props.maxRows, // 最大行数
      rowHeight: props.rowHeight // 行高
    };
  }
  
  getOnceMove(): { onceMoveX: number, onceMoveY: number } {
    const { initContainer } = this.props;
    const positionParams = this.getPositionParams(this.props);
    // 由于宽度和高度的增加和减少，都是以初始宽高的倍数来增长或减少，计算容器初始宽度，需要移动多少x，容器初始高度，需要移动多少y
    const { x: onceMoveX, y: onceMoveY } = calcXY(positionParams, initContainer.height, initContainer.width, 0, 0, true);
    return {
      onceMoveX,
      onceMoveY
    }
  }

  setScroll (scrollParams: { scrollLeft?: number, scrollTop?: number }) {
    const scrollContainerDom = document.querySelector('.react-grid-layout')?.parentElement;
    if (scrollContainerDom) {
      window.setTimeout(() => {
        if (scrollParams.scrollLeft !== undefined) {
          scrollContainerDom.scrollLeft = scrollParams.scrollLeft;
        }
        if (scrollParams.scrollTop !== undefined) {
          scrollContainerDom.scrollTop = scrollParams.scrollTop;
        }
      }, 0)
    }
  }

  getCompactOverlap (): boolean {
    const { allowOverlap, collisionOnDrop } = this.props;
    let compactOverlap = allowOverlap;
    if (allowOverlap && collisionOnDrop) {
      compactOverlap = false;
    }
    return compactOverlap;
  }

  /**
   * When dragging stops, figure out which position the element is closest to and update its x and y.
   * @param  {String} i Index of the child.
   * @param {Number} x X position of the move
   * @param {Number} y Y position of the move
   * @param {Event} e The mousedown event
   * @param {Element} node The current dragging DOM element
   */
  onDragStop: (i: string, x: number, y: number, GridDragEvent) => void = (
    i,
    x,
    y,
    { e, node }
  ) => {
    if (!this.state.activeDrag) return;
    const { oldDragItem } = this.state;
    let { layout } = this.state;
    const { cols, preventCollision, collisionOnDrop, initContainer } = this.props;
    const l = getLayoutItem(layout, i);
    if (!l) return;
    const compactOverlap = this.getCompactOverlap();
    // Move the element here
    const isUserAction = true;
    layout = moveElement(
      layout,
      l,
      x,
      y,
      isUserAction,
      preventCollision,
      compactType(this.props),
      cols,
      compactOverlap,
      collisionOnDrop,
    );
    
    // Set state
    let newLayout = compactOverlap
      ? layout
      : compact(layout, compactType(this.props), cols, compactOverlap, collisionOnDrop);
    
    // 寻找最左侧且 x 小于 0 的元素
    let minXItem: ?LayoutItem;
    // 寻找最上侧且 y 小于 0 的元素
    let minYItem: ?LayoutItem;
    layout.forEach(item => {
      if(item.x < (minXItem?.x || 0)) {
        minXItem = item
      }
      if(item.y < (minYItem?.y || 0)) {
        minYItem = item
      }
    })
    const positionParams = this.getPositionParams(this.props);
    const { onceMoveX,onceMoveY } = this.getOnceMove();
    // 如果找到最左侧且 x 小于 0 的元素，说明需要向左边扩大空间，向右移动元素，修改滚动条左侧距离
    if (minXItem) {
      const moveX = Math.ceil(- minXItem.x / onceMoveX) * onceMoveX;
      // 单次拓展一屏，向右移动元素
      newLayout = layout.map(item => {
        return {
          ...item,
          x: item.x + moveX,
        };
      })
      // 计算最左侧元素的left值
      const position = calcGridItemPosition(positionParams, minXItem.x + moveX, minXItem.y, minXItem.w, minXItem.h, null)
      // 此时由于宽度和元素位置发生变化，需要修改滚动条的位置，滚动到刚好能展示最左侧的元素，计算滚动条左侧的距离
      this.setScroll({
        scrollLeft: position.left - RollingReservationDistance
      })
    } else {
      // 向右边拖拽可能需要缩小空间、向左移动元素
      // 找到最左侧的x值
      const firstLeftX = left(newLayout);
      // 计算最左侧元素的left值
      const position = calcGridItemPosition(positionParams, firstLeftX, 0, 0, 0, null);
      // 由于是按照倍数，减少宽度，所以需要计算减少倍数,向下取整
      const multiplier = Math.floor(position.left / initContainer.width);
      const countX = onceMoveX * multiplier;
      // 如果倍数 > 0，说明需要减少宽度，向左移动元素
      if(multiplier > 0) {
        newLayout = newLayout.map(item => {
          return {
            ...item,
            x: item.x - countX,
          };
        })
        // 如果移动的元素，依然是最左侧的那个元素，修改滚动条左侧的距离，改成 0
        let minXItem= newLayout[0];
        newLayout.forEach(item => {
          if(item.x < (minXItem?.x || 0)) {
            minXItem = item
          }
        })
        if (this.state.activeDrag?.i && minXItem?.i === this.state.activeDrag?.i) {
          if (multiplier > 0) {
            this.setScroll({
              scrollLeft: 0
            })
          }
        }
      }
    }
    // 和左右方向同理
    if (minYItem) { 
      newLayout = layout.map(item => {
        return {
          ...item,
          y: item.y + onceMoveY,
        };
      })
      const position = calcGridItemPosition(positionParams, minYItem.x, minYItem.y + onceMoveY, minYItem.w, minYItem.h, null)
      this.setScroll({
        scrollTop: position.top - RollingReservationDistance
      })
    } else {
      const firstTopY = top(newLayout);
      const position = calcGridItemPosition(positionParams, 0, firstTopY, 0, 0, null);
      const multiplier = Math.floor(position.top / initContainer.height);
      const countY = onceMoveY * multiplier;
      if(multiplier > 0) {
        newLayout = newLayout.map(item => {
          return {
            ...item,
            y: item.y - countY,
          };
        })
      }
      let minYItem = newLayout[0];
      newLayout.forEach(item => {
        if(item.y < (minYItem?.y || 0)) {
          minYItem = item
        }
      })
      if (this.state.activeDrag?.i && minYItem?.i === this.state.activeDrag?.i) {
        if (multiplier > 0) {
          this.setScroll({
            scrollTop: 0
          })
        }
       }
    }
    
    this.props.onDragStop(newLayout, oldDragItem, l, null, e, node);

    const { oldLayout } = this.state;
    this.setState({
      activeDrag: null,
      layout: newLayout,
      oldDragItem: null,
      oldLayout: null
    });

    this.onLayoutMaybeChanged(newLayout, oldLayout);
  };

  onLayoutMaybeChanged(newLayout: Layout, oldLayout: ?Layout) {
    if (!oldLayout) oldLayout = this.state.layout;

    if (!deepEqual(oldLayout, newLayout)) {
      this.props.onLayoutChange(newLayout);
    }
  }

  onResizeStart: (i: string, w: number, h: number, GridResizeEvent) => void = (
    i,
    w,
    h,
    { e, node }
  ) => {
    const { layout } = this.state;
    const l = getLayoutItem(layout, i);
    if (!l) return;

    this.setState({
      oldResizeItem: cloneLayoutItem(l),
      oldLayout: this.state.layout,
      resizing: true
    });

    this.props.onResizeStart(layout, l, l, null, e, node);
  };

  onResize: (i: string, w: number, h: number, GridResizeEvent) => void = (
    i,
    w,
    h,
    { e, node, size, handle }
  ) => {
    const { oldResizeItem } = this.state;
    const { layout } = this.state;
    const { cols, preventCollision, allowOverlap } = this.props;

    let shouldMoveItem = false;
    let finalLayout;
    let x;
    let y;

    const [newLayout, l] = withLayoutItem(layout, i, l => {
      let hasCollisions;
      x = l.x;
      y = l.y;
      if (["sw", "w", "nw", "n", "ne"].indexOf(handle) !== -1) {
        if (["sw", "nw", "w"].indexOf(handle) !== -1) {
          x = l.x + (l.w - w);
          w = l.x !== x && x < 0 ? l.w : w;
          x = x < 0 ? 0 : x;
        }

        if (["ne", "n", "nw"].indexOf(handle) !== -1) {
          y = l.y + (l.h - h);
          h = l.y !== y && y < 0 ? l.h : h;
          y = y < 0 ? 0 : y;
        }

        shouldMoveItem = true;
      }

      // Something like quad tree should be used
      // to find collisions faster
      if (preventCollision && !allowOverlap) {
        const collisions = getAllCollisions(layout, {
          ...l,
          w,
          h,
          x,
          y
        }).filter(layoutItem => layoutItem.i !== l.i);
        hasCollisions = collisions.length > 0;

        // If we're colliding, we need adjust the placeholder.
        if (hasCollisions) {
          // Reset layoutItem dimensions if there were collisions
          y = l.y;
          h = l.h;
          x = l.x;
          w = l.w;
          shouldMoveItem = false;
        }
      }

      l.w = w;
      l.h = h;

      return l;
    });

    // Shouldn't ever happen, but typechecking makes it necessary
    if (!l) return;

    finalLayout = newLayout;
    if (shouldMoveItem) {
      // Move the element to the new position.
      const isUserAction = true;
      finalLayout = moveElement(
        newLayout,
        l,
        x,
        y,
        isUserAction,
        this.props.preventCollision,
        compactType(this.props),
        cols,
        allowOverlap
      );
    }

    // Create placeholder element (display only)
    const placeholder = {
      w: l.w,
      h: l.h,
      x: l.x,
      y: l.y,
      static: true,
      i: i
    };

    this.props.onResize(finalLayout, oldResizeItem, l, placeholder, e, node);

    // Re-compact the newLayout and set the drag placeholder.
    this.setState({
      layout: allowOverlap
        ? finalLayout
        : compact(finalLayout, compactType(this.props), cols),
      activeDrag: placeholder
    });
  };

  onResizeStop: (i: string, w: number, h: number, GridResizeEvent) => void = (
    i,
    w,
    h,
    { e, node }
  ) => {
    const { layout, oldResizeItem } = this.state;
    const { cols, allowOverlap, collisionOnDrop } = this.props;
    const l = getLayoutItem(layout, i);

    let compactOverlap = allowOverlap;
    if (collisionOnDrop) {
      compactOverlap = false;
    }

    // Set state
    const newLayout = compactOverlap
      ? layout
      : compact(layout, compactType(this.props), cols, compactOverlap, collisionOnDrop);

    this.props.onResizeStop(newLayout, oldResizeItem, l, null, e, node);

    const { oldLayout } = this.state;
    this.setState({
      activeDrag: null,
      layout: newLayout,
      oldResizeItem: null,
      oldLayout: null,
      resizing: false
    });

    this.onLayoutMaybeChanged(newLayout, oldLayout);
  };

  /**
   * Create a placeholder object.
   * @return {Element} Placeholder div.
   */
  placeholder(): ?ReactElement<any> {
    const { activeDrag } = this.state;
    if (!activeDrag) return null;
    const {
      width,
      cols,
      margin,
      containerPadding,
      rowHeight,
      maxRows,
      useCSSTransforms,
      transformScale
    } = this.props;

    // {...this.state.activeDrag} is pretty slow, actually
    return (
      <GridItem
        w={activeDrag.w}
        h={activeDrag.h}
        x={activeDrag.x}
        y={activeDrag.y}
        i={activeDrag.i}
        className={`react-grid-placeholder ${
          this.state.resizing ? "placeholder-resizing" : ""
        }`}
        containerWidth={width}
        cols={cols}
        margin={margin}
        containerPadding={containerPadding || margin}
        maxRows={maxRows}
        rowHeight={rowHeight}
        isDraggable={false}
        isResizable={false}
        isBounded={false}
        useCSSTransforms={useCSSTransforms}
        transformScale={transformScale}
      >
        <div />
      </GridItem>
    );
  }

  /**
   * Given a grid item, set its style attributes & surround in a <Draggable>.
   * @param  {Element} child React element.
   * @return {Element}       Element wrapped in draggable and properly placed.
   */
  processGridItem(
    child: ReactElement<any>,
    isDroppingItem?: boolean
  ): ?ReactElement<any> {
    if (!child || !child.key) return;
    const l = getLayoutItem(this.state.layout, String(child.key));
    if (!l) return null;
    const {
      delay,
      width,
      cols,
      margin,
      containerPadding,
      rowHeight,
      maxRows,
      isDraggable,
      isResizable,
      isBounded,
      useCSSTransforms,
      transformScale,
      draggableCancel,
      draggableHandle,
      resizeHandles,
      resizeHandle
    } = this.props;
    const { mounted, droppingPosition } = this.state;

    // Determine user manipulations possible.
    // If an item is static, it can't be manipulated by default.
    // Any properties defined directly on the grid item will take precedence.
    const draggable =
      typeof l.isDraggable === "boolean"
        ? l.isDraggable
        : !l.static && isDraggable;
    const resizable =
      typeof l.isResizable === "boolean"
        ? l.isResizable
        : !l.static && isResizable;
    const resizeHandlesOptions = l.resizeHandles || resizeHandles;

    // isBounded set on child if set on parent, and child is not explicitly false
    const bounded = draggable && isBounded && l.isBounded !== false;

    return (
      <GridItem
        delay={delay}
        containerWidth={width}
        cols={cols}
        margin={margin}
        containerPadding={containerPadding || margin}
        maxRows={maxRows}
        rowHeight={rowHeight}
        cancel={draggableCancel}
        handle={draggableHandle}
        onDragStop={this.onDragStop}
        onDragStart={this.onDragStart} // 拖拽开始，创建 placeholder，设置 oldDragItem，oldLayout，activeDrag
        onDrag={this.onDrag} // 拖拽过程中
        onResizeStart={this.onResizeStart} 
        onResize={this.onResize}
        onResizeStop={this.onResizeStop}
        isDraggable={draggable}
        isResizable={resizable}
        isBounded={bounded}
        useCSSTransforms={useCSSTransforms && mounted}
        usePercentages={!mounted}
        transformScale={transformScale}
        w={l.w}
        h={l.h}
        x={l.x}
        y={l.y}
        i={l.i}
        minH={l.minH}
        minW={l.minW}
        maxH={l.maxH}
        maxW={l.maxW}
        static={l.static}
        droppingPosition={isDroppingItem ? droppingPosition : undefined}
        resizeHandles={resizeHandlesOptions}
        resizeHandle={resizeHandle}
      >
        {child}
      </GridItem>
    );
  }

  // Called while dragging an element. Part of browser native drag/drop API.
  // Native event target might be the layout itself, or an element within the layout.
  onDragOver: DragOverEvent => void | false = e => {
    // console.log("ReactGridLayout:" ,"onDragOver");
    e.preventDefault(); // Prevent any browser native action
    e.stopPropagation();

    // we should ignore events from layout's children in Firefox
    // to avoid unpredictable jumping of a dropping placeholder
    // FIXME remove this hack
    if (
      isFirefox &&
      // $FlowIgnore can't figure this out
      !e.nativeEvent.target?.classList.contains(layoutClassName)
    ) {
      return false;
    }

    const {
      droppingItem,
      onDropDragOver,
      margin,
      cols,
      rowHeight,
      maxRows,
      width,
      containerPadding,
      transformScale,
      drayOverBoundary
    } = this.props;
    // Allow user to customize the dropping item or short-circuit the drop based on the results
    // of the `onDragOver(e: Event)` callback.
    const onDragOverResult = onDropDragOver?.(e);
    if (onDragOverResult === false) {
      if (this.state.droppingDOMNode) {
        this.removeDroppingPlaceholder();
      }
      return false;
    }
    const finalDroppingItem = { ...droppingItem, ...onDragOverResult };

    const { layout } = this.state;

    // $FlowIgnore missing def
    const gridRect = e.currentTarget.getBoundingClientRect(); // The grid's position in the viewport

    // Calculate the mouse position relative to the grid
    const layerX = e.clientX - gridRect.left;
    const layerY = e.clientY - gridRect.top;
    const droppingPosition = {
      left: layerX / transformScale,
      top: layerY / transformScale,
      e
    };

    const { containerWidth,containerHeight } = this.getFinalContainerWH;
    if (droppingPosition.top <= drayOverBoundary) {
      this.setState({
        isDragOverTop: true
      });
    } else {
      this.setState({
        isDragOverTop: false
      });
    }
    if (droppingPosition.top >= (containerHeight - drayOverBoundary)) {
      this.setState({
        isDragOverBottom: true
      });
    } else {
      this.setState({
        isDragOverBottom: false
      });
    }

    if (droppingPosition.left <= drayOverBoundary) {
      this.setState({
        isDragOverLeft: true
      });
    } else {
      this.setState({
        isDragOverLeft: false
      });
    }
    if (droppingPosition.left >= (containerWidth - drayOverBoundary)) {
      this.setState({
        isDragOverRight: true
      });
    } else {
      this.setState({
        isDragOverRight: false
      });
    }

    if (!this.state.droppingDOMNode) {
      const positionParams: PositionParams = {
        cols,
        margin,
        maxRows,
        rowHeight,
        containerWidth: width,
        containerPadding: containerPadding || margin
      };

      const calculatedPosition = calcXY(
        positionParams,
        layerY,
        layerX,
        finalDroppingItem.w,
        finalDroppingItem.h
      );

      this.setState({
        droppingDOMNode: <div key={finalDroppingItem.i} />,
        droppingPosition,
        layout: [
          ...layout,
          {
            ...finalDroppingItem,
            x: calculatedPosition.x,
            y: calculatedPosition.y,
            static: false,
            isDraggable: true
          }
        ]
      });
    } else if (this.state.droppingPosition) {
      const { left, top } = this.state.droppingPosition;
      const shouldUpdatePosition = left != layerX || top != layerY;
      if (shouldUpdatePosition) {
        this.setState({ droppingPosition });
      }
    }
  };

  // 清除droppingDOMNode，清除activeDrag，清除 layout 中 droppingItem
  removeDroppingPlaceholder: () => void = () => {
    const { droppingItem, cols } = this.props;
    const { layout } = this.state;

    const newLayout = compact(
      layout.filter(l => l.i !== droppingItem.i),
      compactType(this.props),
      cols,
      this.props.allowOverlap
    );

    const { oldLayout } = this.state;
    this.setState({
      layout: newLayout,
      droppingDOMNode: null,
      activeDrag: null,
      droppingPosition: undefined,
      isDragOverTop: false,
      isDragOverBottom: false,
      isDragOverLeft: false,
      isDragOverRight: false,
    });

    this.onLayoutMaybeChanged(newLayout, oldLayout);
  };
  
  onDragLeave: EventHandler = e => {
    // console.log("ReactGridLayout:" ,"onDragLeave");
    e.preventDefault(); // Prevent any browser native action
    e.stopPropagation();
    this.dragEnterCounter--;

    // onDragLeave can be triggered on each layout's child.
    // But we know that count of dragEnter and dragLeave events
    // will be balanced after leaving the layout's container
    // so we can increase and decrease count of dragEnter and
    // when it'll be equal to 0 we'll remove the placeholder
    if (this.dragEnterCounter === 0) {
      this.removeDroppingPlaceholder();
    }
  };

  onDragEnter: EventHandler = e => {
    e.preventDefault(); // Prevent any browser native action
    e.stopPropagation();
    this.dragEnterCounter++;
  };

  onDrop: EventHandler = (e: Event) => {
    e.preventDefault(); // Prevent any browser native action
    e.stopPropagation();
    const { droppingItem, cols, collisionOnDrop } = this.props;
    const { layout,isDragOverTop,isDragOverLeft } = this.state;
    let findDropping = layout.find(l => l.i === droppingItem.i);
    if (!findDropping) return;

    // reset dragEnter counter on drop
    this.dragEnterCounter = 0;
    this.removeDroppingPlaceholder();
    const { onceMoveX,onceMoveY } = this.getOnceMove();
    let newLayout: Layout;
    if (isDragOverTop) {
      newLayout = layout.map(item => {
        if (item.i === droppingItem.i) {
          findDropping = {
            ...item,
            y: Math.max(onceMoveY - item.h - 1,0)
          };
          return {
            ...findDropping
          }
        } else {
          return {
            ...item,
            y: item.y + onceMoveY,
          };
        }
      })
      const positionParams = this.getPositionParams(this.props);
      const position = calcGridItemPosition(positionParams, findDropping.x, findDropping.y, findDropping.w, findDropping.h, null)
      this.setScroll({
        scrollTop: position.top - RollingReservationDistance
      })
    } else if (isDragOverLeft) {
      newLayout = layout.map(item => {
        if (item.i === droppingItem.i) {
          findDropping = {
            ...item,
            x: Math.max(onceMoveX - item.w - 1,0)
          };
          return {
            ...findDropping
          }
        } else {
          return {
            ...item,
            x: item.x + onceMoveX,
          };
        }
      })
      const positionParams = this.getPositionParams(this.props);
      const position = calcGridItemPosition(positionParams, findDropping.x, findDropping.y, findDropping.w, findDropping.h, null)
      this.setScroll({
        scrollLeft: position.left - RollingReservationDistance
      })
    } else {
      const compactOverlap = this.getCompactOverlap();
      newLayout =  compactOverlap
        ? layout : compact(layout, compactType(this.props), cols, compactOverlap, collisionOnDrop)
      console.log(newLayout)
    }
    this.props.onDrop(newLayout, findDropping, e);
  };

  topArea(): null | React.Element<"div"> {
    const { isDragOverTop } = this.state;
    return isDragOverTop ? (<div className="react-grid-layout-top-area"></div>) : null;
  }
  bottomArea(): null | React.Element<"div"> {
    const { isDragOverBottom } = this.state;
    return isDragOverBottom ? (<div className="react-grid-layout-bottom-area"></div>) : null;
  }
  leftArea(): null | React.Element<"div"> {
    const { isDragOverLeft } = this.state;
    return isDragOverLeft ? (<div className="react-grid-layout-left-area"></div>) : null;
  }
  rightArea(): null | React.Element<"div"> {
    const { isDragOverRight } = this.state;
    return isDragOverRight ? (<div className="react-grid-layout-right-area"></div>) : null;
  }

  get getFinalContainerWH(): { containerHeight: number, containerWidth: number} {
    const { initContainer } = this.props;
    // 容器的宽度，最小为初始宽度，且宽度为初始宽度的倍数
    const containerWidth = Math.max(initContainer.width, Math.ceil((this.containerWidth() || 0 ) / initContainer.width) * initContainer.width);
    const containerHeight = Math.max(initContainer.height, Math.ceil((this.containerHeight() || 0) / initContainer.height) * initContainer.height);
    return {
      containerWidth: containerWidth,
      containerHeight: containerHeight + 1
    }
  }

  render(): React.Element<"div"> {
    const { className, style, isDroppable, innerRef } = this.props;
    const mergedClassName = clsx(layoutClassName, className);
    const { containerWidth, containerHeight } = this.getFinalContainerWH;
    const mergedStyle = {
      width: containerWidth,
      height: containerHeight,
      ...style
    };
    return (
      <div
        ref={innerRef}
        className={mergedClassName}
        style = { mergedStyle }
        // 处理元素拖拽到容器内的事件, 进入、在上方、离开、释放事件
        onDrop={isDroppable ? this.onDrop : noop} // 放置目标上释放被拖动的元素，松开鼠标，清除 removeDroppingPlaceholder，还原 this.dragEnterCounter，执行 props 中的 onDrop 函数
        onDragEnter={isDroppable ? this.onDragEnter : noop} // 拖拽元素进入，this.dragEnterCounter++;
        onDragOver={isDroppable ? this.onDragOver : noop} // 拖拽元素在上方，执行 props 中的 onDropDragOver 函数，添加 droppingDOMNode，计算 droppingPosition，在 layout 中添加数据
        onDragLeave={isDroppable ? this.onDragLeave : noop}  // 拖拽元素离开， 通过 this.dragEnterCounter 判断是否清除 removeDroppingPlaceholder
      >
        {React.Children.map(this.props.children, child =>
          this.processGridItem(child)
        )}
        {/* 外部元素拖拽的色块背景色，渲染 droppingDOMNode */}
        {isDroppable && this.state.droppingDOMNode && this.processGridItem(this.state.droppingDOMNode, true)} 
        {/* 内部元素拖拽过程中，拖拽的色块背景色，渲染 activeDrag */ }
        { this.placeholder() }
        { this.topArea() }
        { this.bottomArea() }
        { this.leftArea() }
        { this.rightArea() }
      </div>
    );
  }
}
