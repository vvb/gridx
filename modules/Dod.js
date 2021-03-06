define([
	"dojo/_base/kernel",
	"dojo/dom-construct",
	"dojo/dom-style",
	"dojo/dom-class",
	"dojo/dom-geometry",
	"dojo/_base/lang",
	"dojo/_base/Deferred",
	"dojo/_base/array",
	"../core/_Module",
	"dojo/_base/declare",
	"dojo/_base/fx",
	"dojo/fx",
	"dojo/keys",
	'../support/query',
	'dijit/a11y',
	'dijit/registry',
	'dojo/_base/event',
	'dojo/_base/sniff'
], function(kernel, domConstruct, domStyle, domClass, domGeometry, lang, 
			Deferred, array, _Module, declare, baseFx, fx, keys, query, a11y, registry, event, has){
	kernel.experimental('gridx/modules/Dod');

/*=====
	return declare(_Module, {
		// summary:
		//		Details on demand.

		// useAnimation: Boolean
		//		Indicates whether to use animation (slide) when showing/hiding the detail part.
		useAnimation: true,

		// duration: Number
		//		The time used to play the animation.
		duration: 750,
		
		defaultShow: false,

		showExpando: true,

		show: function(row){
			// summary:
			//		Show the detail part of a row, if this row has a detail part.
			//		Use animation (slide the detail part out) if useAnimation is true.
			//		Nothing happens if rowId is not valid or the row does not has a detail part.
			// rowId: String
			//		The ID of a row.
			// return: dojo.Deferred.
			//		A deferred object indicating when the detail is completely shown.
		},

		hide: function(row){
			// summary:
			//		Hide the detail part of a row, if this row has a detail part.
			//		Use animation (slide the detail part in) if useAnimation is true.
			//		Nothing happens if rowId is not valid or the row does not has a detail part.
			// rowId: String
			//		The ID of a row.
			// return: dojo.Deferred.
			//		A deferred object indicating when the detail is completely hidden.
		},

		toggle: function(row){
		},

		refresh: function(row){
		},

		isShown: function(row){
		},

		onShow: function(row){},
		onHide: function(row){}
	});
=====*/
	var dummyFunc = function(){};
	
	return declare(_Module, {
		name: 'dod',
		required: ['body'],
		useAnimation: true,
		duration: 750,
		defaultShow: false,
		showExpando: true,
		
		preload: function(){
			this.initFocus();

			var g = this.grid,
				_events = g._eventNames,
				len = _events.length,
				eventName;

			for(var i = 0; i < len; i++){
				eventName = 'onDod' + _events[i];
				g[eventName] = g[eventName] || dummyFunc;
			}

			this.connect(this.grid.body, '_onMouseEvent', '_dodEventDispatcher');
		},
		
		load: function(args, deferStartup){
			var t =this, g = t.grid;
			t._rowMap = {};
			t.connect(t.grid.body, 'onAfterCell', '_onAfterCell');
			t.connect(t.grid.body, 'onAfterRow', '_onAfterRow');
			t.connect(t.grid.bodyNode, 'onclick', '_onBodyClick');
			t.connect(t.grid.body, 'onUnrender', '_onBodyUnrender');
			t.connect(t.grid, 'onCellKeyDown', '_onCellKeyDown');
			t.connect(t.grid.body, '_onRowMouseOver', '_onRowMouseOver');

			//in IE, renderRow will use bodyNode.innerHTML = str,
			//this will destroy all the node and _row.dodNode's innerHTML wil be destroyed,
			//Here, manually set dodLoaded to false to force dod to re-render the dodNode 
			has('ie') && t.aspect(t.grid.body, 'renderRows', function(s, c, p){
				if(p === 'top' || p === 'bottom'){ return; }
				var i, rowInfo, _row;
				for(i = s; i < s + c; i++){
					rowInfo = g.view.getRowInfo({visualIndex: i});
					_row = t._rowMap[rowInfo.rowId];
					if(_row){
						_row.dodLoaded = false;
						_row.dodLoadingNode = null;
						_row.dodNode = null;
					}
				}
			}, t, 'before');

			if(t.grid.columnResizer){
				t.connect(t.grid.columnResizer, 'onResize', '_onColumnResize');
			}
			t.loaded.callback();
			
		},
		
		rowMixin: {
			showDetail: function(){
				this.grid.dod.show(this);
			},
			hideDetail: function(){
				this.grid.dod.hide(this);
			},
			toggleDetail: function(){
				this.grid.dod.toggle(this);
			},
			refreshDetail: function(){
				this.grid.dod.refreshDetail(this);
			},
			isDetailShown: function(){
				return this.grid.dod.isShown(this);
			}
		},
		
		show: function(row){
			var _row = this._row(row), 
				g = this.grid;
			if(_row.dodShown || _row.inAnim){return;}
			
			_row.dodShown = true;
			
			if(!row.node()){ return; }

			var expando = this._getExpando(row);
			if(expando){expando.firstChild.innerHTML = '-';}
			
			var node = row.node(), w = node.scrollWidth;
			if(!_row.dodLoadingNode){
				_row.dodLoadingNode = domConstruct.create('div', {
					className: 'gridxDodLoadNode', 
					innerHTML: this.grid.nls.loadingInfo
				});
			}
			if(!_row.dodNode){
				_row.dodNode = domConstruct.create('div', {className: 'gridxDodNode'});
			}
			domConstruct.place(_row.dodLoadingNode, node, 'last');
			domConstruct.place(_row.dodNode, node, 'last');
			// domConstruct.place(_row.dodNode, _row.dodLoadingNode, 'last');

			
			domStyle.set(_row.dodLoadingNode, 'width', w + 'px');
			domStyle.set(_row.dodNode, 'width', w + 'px');
			domStyle.set(_row.dodNode, 'visibility', 'hidden');
			domStyle.set(_row.dodNode, 'overflow', 'hidden');
			domStyle.set(_row.dodNode, 'height', '0px');

			
			domClass.add(node, 'gridxDodShown');
			//domStyle.set(_row.dodNode, 'display', 'none');
			
			if(_row.dodLoaded){
				this._detailLoadComplete(row);
				return;
			}else{
				domStyle.set(_row.dodLoadingNode, 'display', 'block');
				if(g.autoHeight){
					g.vLayout.reLayout();
				}
				_row.inLoading = true;
			}
			
			if(this.grid.rowHeader){
				var rowHeaderNode = query('[rowid="' + this.grid._escapeId(row.id) + '"].gridxRowHeaderRow', this.grid.rowHeader.bodyNode)[0];
				//TODO: 1 is the border for claro theme, will fix
				var h = domStyle.get(row.node(), 'height');
				domStyle.set(rowHeaderNode.firstChild, 'height', h + 'px');
				domStyle.set(rowHeaderNode, 'height', h + 'px');
			}
			
			var df = new Deferred(), _this = this;
			if(this.arg('detailProvider')){
				this.detailProvider(this.grid, row.id, _row.dodNode, df);
			}else{
				df.callback();
			}
			df.then(
				lang.hitch(this, '_detailLoadComplete', row), 
				lang.hitch(this, '_detailLoadError', row)
			);

		},
		
		hide: function(row){
			var rowHeaderNode,
				_row = this._row(row),
				g = this.grid,
				escapeId = g._escapeId;

			if(!_row.dodShown || _row.inAnim || _row.inLoading){return;}
			
			if(!row.node()){
				_row.dodShown = false;
				return;
			}
			
			domClass.remove(row.node(), 'gridxDodShown');
			domStyle.set(_row.dodLoadingNode, 'display', 'none');
			if(this.grid.rowHeader){
				rowHeaderNode = query('[rowid="' + escapeId(row.id) + '"].gridxRowHeaderRow', this.grid.rowHeader.bodyNode)[0];
				var h = domStyle.get(row.node(), 'height');
				domStyle.set(rowHeaderNode.firstChild, 'height', h + 'px');
				domStyle.set(rowHeaderNode, 'height', h + 'px');
				//TODO: 1 is the border for claro theme, will fix
			}
			var expando = this._getExpando(row);
			if(expando){expando.firstChild.innerHTML = '+';}

			if(this.arg('useAnimation')){
				_row.inAnim = true;
				fx.wipeOut({
					node: _row.dodNode,
					duration: this.arg('duration'),
					onEnd: function(){
						_row.dodShown = false;
						_row.inAnim = false;
						g.body.onRender();
					}
				}).play();
				if(this.grid.rowHeader){
					rowHeaderNode = query('[rowid="' + escapeId(row.id) + '"].gridxRowHeaderRow', this.grid.rowHeader.bodyNode)[0];
					baseFx.animateProperty({ node: rowHeaderNode.firstChild, duration:this.arg('duration'),
						properties: {
							height: { start:rowHeaderNode.offsetHeight, end:rowHeaderNode.offsetHeight - _row.dodNode.scrollHeight, units:"px" }
						}
					}).play();
					baseFx.animateProperty({ node: rowHeaderNode, duration:this.arg('duration'),
						properties: {
							height: { start:rowHeaderNode.offsetHeight, end:rowHeaderNode.offsetHeight - _row.dodNode.scrollHeight, units:"px" }
						}
					}).play();					
				}
			}else{
				_row.dodShown = false;
				_row.inAnim = false;
				if(this.grid.rowHeader){
					rowHeaderNode = query('[rowid="' + escapeId(row.id) + '"].gridxRowHeaderRow', this.grid.rowHeader.bodyNode)[0];
					rowHeaderNode.firstChild.style.height = rowHeaderNode.offsetHeight - _row.dodNode.scrollHeight + 'px';
					rowHeaderNode.style.height = rowHeaderNode.offsetHeight - _row.dodNode.scrollHeight + 'px';
				}
				_row.dodNode.style.display = 'none';
				g.body.onRender();
				
			}
			
			_row.defaultShow = false;
			this.onHide(row);
		},
		
		toggle: function(row){
			if(this.isShown(row)){
				this.hide(row);
			}else{
				this.show(row);
			}
		},
		refresh: function(row){
			var _row = this._row(row);
			_row.dodLoaded = false;
			this.show(row);
		},
		
		isShown: function(row){
			var _row = this._row(row);
			return !!_row.dodShown;
		},
		
		onShow: function(row){},
		onHide: function(row){},
		
		initFocus: function(){
			var t = this,
				focus = t.grid.focus;
			focus.registerArea({
				name: 'navigabledod',
				priority: 1,
				scope: t,
				doFocus: t._doFocus,
				doBlur: t._doBlur,
				onFocus: t._onFocus,
				onBlur: t._onBlur,
				connects: [
					t.connect(t.grid, 'onCellKeyDown', '_onCellKeyDown'),
					t.connect(t.grid, 'onDodKeyDown', '_onRowKeyDown')
				]
			});	
		},
		
		//*****************************	private	*****************************
		_rowMap: null,
		_lastOpen: null, //only useful when autoClose is true.
		_row: function(/*id|obj*/row){
			var id = row;
			if(typeof row === 'object'){
				id = row.id;
			}
			return this._rowMap[id] || (this._rowMap[id] = {});
		},
		
		_onBodyClick: function(e){
			if(!domClass.contains(e.target, 'gridxDodExpando') 
			&& !domClass.contains(e.target, 'gridxDodExpandoText') 
			|| this.grid.domNode != query(e.target).closest('.gridx')[0]){return;}
			var node = e.target;
			while(node && !domClass.contains(node, 'gridxRow')){
				node = node.parentNode;
			}
			
			// event.stop(e);
			var idx = node.getAttribute('rowindex');
			
			
			this.toggle(this.grid.row(parseInt(idx, 10)));
		},
		
		_onRowMouseOver: function(e){
			var target = e.target;
			var dodNode = this._rowMap[e.rowId]? this._rowMap[e.rowId].dodNode : undefined;
			
			if(dodNode){
				while(target && target !== dodNode){
					target = target.parentNode;
				}
				if(target){
					domClass.remove(dodNode.parentNode, 'gridxRowOver');
					event.stop(e);
				}
			}
		},
		
		_onAfterRow: function(row){
			var _row = this._row(row);
			if(this.arg('showExpando')){
				var tbl = query('table', row.node())[0];
				var cell = tbl.rows[0].cells[0];
				var span = domConstruct.create('span', {
					className: 'gridxDodExpando',
					innerHTML: '<span class="gridxDodExpandoText">' 
						+ (this.arg('defaultShow') ? '-' : '+') + '</span>'
				}, cell, 'first');
			}
			
			if(this.isShown(row) || (this.arg('defaultShow') && _row.dodShown === undefined)){
				_row.dodShown = false;
				_row.defaultShow = true;
				this.show(row);
			}
			
		},

		_onBodyUnrender: function(row){
			// Remove the cache for the row when it is destroyed, so that dod recreates
			// necessary dom nodes when the row is rendered again.
			if(!row){return;}
			var _row = this._row(row);
			if(!_row){return;}

			function _removeNode(node){
				if(node && node.parentNode){
					node.parentNode.removeChild(node);
				}
			}

			_removeNode(_row.dodNode);
			_removeNode(_row.dodLoadingNode);
		},

		_onAfterCell: function(cell){
			//when the first cell's content is changed, update the expando
			if(this.arg('showExpando') && cell.node().cellIndex === 0){
				this._onAfterRow(cell.row);
			}
		},
		
		_onColumnResize: function(){
			query('.gridxDodNode', this.grid.bodyNode).forEach(function(node){
				domStyle.set(node, 'width', node.parentNode.firstChild.offsetWidth + 'px');
			});
		},
		
		_detailLoadComplete: function(row){
			var _row = this._row(row), g = this.grid, escapeId = g._escapeId, rowHeaderNode;
			if(!this.isShown(row)){return;}
			_row.dodLoaded = true;
			
			var gridNodes = query('.gridx', _row.dodNode);
			if(gridNodes.length){
				//flag gridInGrid to query
				query.isGridInGrid[this.grid.id] = true;
			}
	
			if(_row.defaultShow){
				// domStyle.set(_row.dodNode, 'display', 'block');
				_row.dodNode.style.display = 'block';
				_row.dodNode.style.visibility = 'visible';
				_row.dodNode.style.height = 'auto';
				g.body.onRender();
				if(this.grid.rowHeader){
					rowHeaderNode = query('[rowid="' + escapeId(row.id) + '"].gridxRowHeaderRow', this.grid.rowHeader.bodyNode)[0];
					rowHeaderNode.firstChild.style.height = row.node().firstChild.offsetHeight + _row.dodNode.scrollHeight + 'px';
					rowHeaderNode.style.height = row.node().firstChild.offsetHeight + _row.dodNode.scrollHeight + 'px';
	
				}
			}else{
				if(domStyle.get(_row.dodLoadingNode, 'display') == 'block'){
					domGeometry.setMarginBox(_row.dodNode, {h: domGeometry.getMarginBox(_row.dodLoadingNode).h});
					domStyle.set(_row.dodNode, 'display', 'block');
				}

				if(this.arg('useAnimation')){
					_row.inAnim = true;
					fx.wipeIn({
						node: _row.dodNode,
						duration: this.arg('duration'),
						onEnd: function(){
							_row.inAnim = false;
							g.body.onRender();
						}
					}).play();
					
					if(this.grid.rowHeader){
						rowHeaderNode = query('[rowid="' + escapeId(row.id) + '"].gridxRowHeaderRow', this.grid.rowHeader.bodyNode)[0];
						baseFx.animateProperty({
							node: rowHeaderNode.firstChild,
							duration: this.arg('duration'),
							onEnd: function(){
								try{
									var rowHeaderNode = query('[rowid="' + escapeId(row.id) + '"].gridxRowHeaderRow', g.rowHeader.bodyNode)[0];
									var h = row.node().firstChild.offsetHeight + _row.dodNode.offsetHeight;
									rowHeaderNode.firstChild.style.height = h + 'px';
								}catch(e){}
							},
							properties: {
								height: {
									start: rowHeaderNode.offsetHeight,
									end: row.node().firstChild.offsetHeight + _row.dodNode.scrollHeight,
									units:"px"
								}
							}
						}).play();
						baseFx.animateProperty({
							node: rowHeaderNode,
							duration: this.arg('duration'),
							onEnd: function(){
								try{
									var rowHeaderNode = query('[rowid="' + escapeId(row.id) + '"].gridxRowHeaderRow', g.rowHeader.bodyNode)[0];
									var h = row.node().firstChild.offsetHeight + _row.dodNode.offsetHeight;
									rowHeaderNode.style.height = h + 'px';
								}catch(e){}
							},
							properties: {
								height: {
									start: rowHeaderNode.offsetHeight,
									end: row.node().firstChild.offsetHeight + _row.dodNode.scrollHeight,
									units:"px"
								}
							}
						}).play();
					}
				}else{
					_row.dodNode.style.display = 'block';
					_row.dodNode.style.visibility = 'visible';
					_row.dodNode.style.height = 'auto';
					g.body.onRender();
					if(this.grid.rowHeader){
						rowHeaderNode = query('[rowid="' + escapeId(row.id) + '"].gridxRowHeaderRow', this.grid.rowHeader.bodyNode)[0];
						var h = row.node().firstChild.offsetHeight + _row.dodNode.offsetHeight;
						rowHeaderNode.firstChild.style.height = h + 'px';
						rowHeaderNode.style.height = h + 'px';
					}
					
				}
			}
			domStyle.set(_row.dodLoadingNode, 'display', 'none');
			_row.inLoading = false;
			
			//***for nested grid in grid ****
			
			var gs = this.grid._nestedGrids = this.grid._nestedGrids? this.grid._nestedGrids : [];
			for(var i = 0; i < gridNodes.length; i++){
				var gig = registry.byNode(gridNodes[i]);
				gig._outerGrid = g;
				gs.push(gig);
				if(!gig._refreshForDod){
					gig._refreshForDod = true;
					// gig.resize();
					// gig.vLayout.reLayout();
					this.connect(gig.focus, 'tab', '_tab');
					this.connect(gig.lastFocusNode, 'onfocus', '_lastNodeFocus');
					this.connect(gig.domNode, 'onfocus', '_domNodeFocus');
					this.connect(gig.vLayout, 'reLayout', function(){
						gig._outerGrid && gig._outerGrid.vLayout.reLayout();
					})
					this.connect(gig, 'onRowMouseOver', function(){
						if(gig._outerGrid){
							query('.gridxRowOver', gig._outerGrid.bodyNode).removeClass('gridxRowOver');
						}
					});
					
				}
			}
			g.vLayout.reLayout();
			this.onShow(row);
		},
		
		_detailLoadError: function(row){
			var _row = this._row(row);
			_row.dodLoaded = false;
			if(!this.isShown(row)){return;}
			_row.dodLoadingNode.innerHTML = this.grid.nls.loadFailInfo;
		},
		
		_showLoading: function(row){
			var _row = this._row(row);
			var node = _row.dodLoadingNode;
			node.innerHTML = this.grid.nls.loadingInfo;
		},
		
		_getExpando: function(row){
			if(!this.showExpando){
				return null;
			}
			var tbl = query('table', row.node())[0];
			var cell = tbl.rows[0].cells[0];
			return cell? cell.firstChild : null;
		},
		
		_onCellKeyDown: function(e){
			var t = this,
				grid = t.grid,
				focus = grid.focus,
				row = grid.row(e.rowId, 1);
			if(e.keyCode == keys.DOWN_ARROW && e.ctrlKey){
				t.show(row);
				e.stopPropagation();
			}else if(e.keyCode == keys.UP_ARROW && e.ctrlKey){
				t.hide(row);
				e.stopPropagation();
			}
		
			if(e.keyCode == keys.F4 && !t._navigating && focus.currentArea() == 'body'){
				if(t._beginNavigate(e.rowId, e.columnId)){
					focus.focusArea('navigabledod');
					if(has('ie') < 9){
						e.returnValue = false;
						return false;
					}
					event.stop(e);
				}
			}else if(e.keyCode == keys.ESCAPE && t._navigating && focus.currentArea() == 'navigabledod'){
				t._navigating = false;
				focus.focusArea('body');
			}
		},
		
		//Focus
		_onRowKeyDown: function(e){
			var t = this,
				focus = t.grid.focus;

			if(e.keyCode == keys.ESCAPE && t._navigating && focus.currentArea() == 'navigabledod'){
				t._navigating = false;
				focus.focusArea('body');
			}
		},
		
		_beginNavigate: function(rowId){
			
			var t = this,
				row = t.grid.row(rowId, 1),
				_row = t._row(rowId);
			if(!_row.dodShown){
				return false;
			}
			t._navigating = true;
			// t._focusColId = colId;
			t._focusRowId = rowId;
			var navElems = t._navElems = a11y._getTabNavigable(row.node());
			return (navElems.highest || navElems.last) && (navElems.lowest || navElems.first);
			
		},
		_tab: function(step, evt){
			this._step = step;
		},
		
		_domNodeFocus: function(evt){
			if(evt && this._step === -1){
				var navElems = this._navElems,
					firstElem = navElems.lowest || navElems.first,
					lastElem = navElems.highest || navElems.last ||firstElem,
					target = has('ie') ? evt.srcElement : evt.target;
				
				if(target == firstElem){
					// this._doFocus(evt, -1);
					lastElem.focus();
				}
				return false;
			}			
		},
		
		_lastNodeFocus: function(evt){
			if(evt && this._step === 1){
				var navElems = this._navElems,
					firstElem = navElems.lowest || navElems.first,
					lastElem = navElems.highest || navElems.last ||firstElem,
					target = has('ie') ? evt.srcElement : evt.target;
	
				if(target == lastElem){
					// this._onBlur();
					setTimeout(function(){
						firstElem.focus();
					}, 1);
					// event.stop(evt);
					// this.focus.tab(evt, 1);
				}
				return false;
			}
		},
		
		_doFocus: function(evt, step){
			if(this._navigating){
				var elems = this._navElems,
					func = function(){
						var toFocus = step < 0 ? (elems.highest || elems.last) : (elems.lowest || elems.first);
						if(toFocus){
							toFocus.focus();
						}
					};
				if(has('webkit')){
					func();
				}else{
					setTimeout(func, 5);
				}
				return true;
			}
			return false;
		},
		
		_onFocus: function(evt){
			var node = evt.target, dn = this.grid.domNode;
			while(node && node !== dn && !domClass.contains(node, 'gridxDodNode')){
				node = node.parentNode;
			}
			if(node && node !== dn){
				var dodNode = node,
					rowNode = dodNode.parentNode;
				// this.grid.hScroller.scrollToColumn(colId);
				if(rowNode){
					var rowId = rowNode.getAttribute('rowid');
					return dodNode !== evt.target && this._beginNavigate(rowId);
				}
			}
			return false;
		},		
		
		_doBlur: function(evt, step){
			if(evt){
				var navElems = this._navElems,
					firstElem = navElems.lowest || navElems.first,
					lastElem = navElems.highest || navElems.last ||firstElem,
					target = has('ie') ? evt.srcElement : evt.target;

				if(target == (step > 0 ? lastElem : firstElem)){
					event.stop(evt);
				}
				return false;
			}else{
				this._navigating = false;
				return true;
			}
		},
		
		_onBlur: function(evt){
			this._navigating = false;
		},

		_dodEventDispatcher: function(eventName, e){
			var target = e.target,
				evtDod = 'onDod' + eventName,
				g = this.grid;

			var atrs = ['rowId', 'columnId', 'rowIndex', 'visualIndex', 'columnIndex', 'parentId', 'cellNode'];
			array.forEach(atrs, function(atr){
				if(atr in e){ 
					e[atr] = undefined; 
				}
			});

			while(target && !domClass.contains(target, 'gridxDodNode')){
				target = target.parentNode;
			}
			if(target){
				var n = target.parentNode;
				e.rowId = n.getAttribute('rowid');
				e.parentId = n.getAttribute('parentid');
				e.rowIndex = parseInt(n.getAttribute('rowindex'), 10);
				e.visualIndex = parseInt(n.getAttribute('visualindex'), 10);

				g[evtDod] && g[evtDod](e);
				return;
			}
		},

		endFunc: function(){}
	});
});
