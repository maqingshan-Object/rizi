Component({
  properties:{title:{type:String,value:'日子绵绵'},back:{type:Boolean,value:false},theme:{type:String,value:'cream'}},
  data:{statusHeight:20,navHeight:44,leftPadding:20},
  lifetimes:{attached(){try{const info=wx.getWindowInfo();const rect=wx.getMenuButtonBoundingClientRect();this.setData({statusHeight:info.statusBarHeight,navHeight:rect.height+(rect.top-info.statusBarHeight)*2});}catch(e){this.setData({statusHeight:20,navHeight:44});}}},
  methods:{goBack(){if(getCurrentPages().length>1)wx.navigateBack();else wx.switchTab({url:'/pages/days/days'});}}
});
