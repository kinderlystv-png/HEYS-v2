// heys_virtual_list_v1.js — простая виртуализация длинных списков для React UMD
;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  // Пример: <VirtualList items={array} itemHeight={32} height={320} renderItem={fn}/>
  HEYS.VirtualList = function VirtualList(props){
    const { items, itemHeight, height, renderItem } = props;
    const [scroll, setScroll] = React.useState(0);
    const total = (items||[]).length;
    const visibleCount = Math.ceil(height/itemHeight)+2;
    const start = Math.max(0, Math.floor(scroll/itemHeight));
    const end = Math.min(total, start+visibleCount);
    const offsetY = start*itemHeight;
    function onScroll(e){ setScroll(e.target.scrollTop); }
    return React.createElement('div', { style:{overflowY:'auto', height:height+'px', position:'relative'}, onScroll },
      React.createElement('div', { style:{height:(total*itemHeight)+'px', position:'relative'} },
        (items||[]).slice(start,end).map((item,i)=>
          React.createElement('div', { key:(item.id||start+i), style:{position:'absolute', top:(offsetY+i*itemHeight)+'px', left:0, right:0, height:itemHeight+'px'} },
            renderItem(item, start+i)
          )
        )
      )
    );
  };
})(window);
