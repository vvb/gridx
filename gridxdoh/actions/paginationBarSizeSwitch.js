define([
	'dojo/query',
	'dojo/dom-style',
	'dojo/dom-geometry',
	'../GTest'
], function(query, domStyle, domGeo, GTest){
	GTest.actionCheckers.push(
	{
		id: 'paginationBarSizeSwitch 1',
		name: 'set paginationBar.sizeSwitch to false, call paginationBar.refresh() to take effect.',
		condition: function(grid){
			return grid.paginationBar && grid.paginationBar.arg('sizeSwitch');
		},
		action: function(grid, doh, done){
			grid.paginationBar.sizeSwitch = false;
			grid.paginationBar.refresh();
			doh.t(query('.gridxPagerSizeSwitchTD > div', grid.domNode).every(function(node){
				return domStyle.get(node, 'display') == 'none';
			}), 'sizeSwitch is still visible.');
			done.callback();
		}
	},
	{
		id: 'paginationBarSizeSwitch 2',
		name: 'set paginationBar.sizeSwitch to true, call paginationBar.refresh() to take effect.',
		condition: function(grid){
			return grid.paginationBar && !grid.paginationBar.arg('sizeSwitch');
		},
		action: function(grid, doh, done){
			grid.paginationBar.sizeSwitch = true;
			grid.paginationBar.refresh();
			doh.t(query('.gridxPagerSizeSwitchTD > div', grid.domNode).every(function(node){
				return domStyle.get(node, 'display') != 'none';
			}), 'sizeSwitch is not visible.');
			done.callback();
		}
	}
	);
});