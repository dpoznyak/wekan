const subManager = new SubsManager();
const InfiniteScrollIter = 1000;

BlazeComponent.extendComponent({
  onCreated() {
    // for infinite scrolling
    this.cardlimit = new ReactiveVar(InfiniteScrollIter);
  },

  onRendered() {
    const domElement = this.find('.js-perfect-scrollbar');
    if (domElement) {
      this.$(domElement).on('scroll', () => this.updateList(domElement));
      $(window).on(`resize.${this.data().listId}`, () => this.updateList(domElement));

      // we add a Mutation Observer to allow propagations of cardlimit
      // when the spinner stays in the current view (infinite scrolling)
      this.mutationObserver = new MutationObserver(() => this.updateList(domElement));

      this.mutationObserver.observe(domElement, {
        childList: true,
      });

      this.updateList(domElement);
    }

    if (Utils.isMiniScreen()) {
      const lastEdit = $('.last-edit');
      if (lastEdit.length) {
        // this.$('.minicards').animate({
        //   scrollTop:  lastEdit.position().top
        // });
        this.firstNode().scrollTop =  lastEdit.position().top;
      }
    }
  },

  onDestroyed() {
    $(window).off(`resize.${this.data().listId}`);
    if (this.mutationObserver)
      this.mutationObserver.disconnect();
  },

  openForm(options) {
    options = options || {};
    options.position = options.position || 'top';

    const forms = this.childComponents('inlinedForm');
    let form = forms.find((component) => {
      return component.data().position === options.position;
    });
    if (!form && forms.length > 0) {
      form = forms[0];
    }
    form.open();
  },

  addCard(evt) {
    evt.preventDefault();
    const firstCardDom = this.find('.js-minicard:first');
    const lastCardDom = this.find('.js-minicard:last');
    const textarea = $(evt.currentTarget).find('textarea');
    const position = this.currentData().position;
    const title = textarea.val().trim();

    const formComponent = this.childComponents('addCardForm')[0];
    let sortIndex;
    if (position === 'top') {
      sortIndex = Utils.calculateIndex(null, firstCardDom).base;
    } else if (position === 'bottom') {
      sortIndex = Utils.calculateIndex(lastCardDom, null).base;
    }

    var members = formComponent.members.get();

    const labelIds = formComponent.labels.get();
    const customFields = formComponent.customFields.get();
    const dueAt = formComponent.dueDate.get();


    const board = this.data().board();
    let linkedId = '';
    let swimlaneId = '';
    const boardView = Meteor.user().profile.boardView;
    let cardType = 'cardType-card';
    if (title) {
      if (board.isTemplatesBoard()) {
        swimlaneId = this.parentComponent().parentComponent().data()._id; // Always swimlanes view
        const swimlane = Swimlanes.findOne(swimlaneId);
        // If this is the card templates swimlane, insert a card template
        if (swimlane.isCardTemplatesSwimlane())
          cardType = 'template-card';
        // If this is the board templates swimlane, insert a board template and a linked card
        else if (swimlane.isBoardTemplatesSwimlane()) {
          linkedId = Boards.insert({
            title,
            permission: 'private',
            type: 'template-board',
          });
          Swimlanes.insert({
            title: TAPi18n.__('default'),
            boardId: linkedId,
          });
          cardType = 'cardType-linkedBoard';
        }
      } else if (boardView === 'board-view-swimlanes')
        swimlaneId = Utils.getBoardBodyComponent(this).data()._id;
      else if ((boardView === 'board-view-lists') || (boardView === 'board-view-cal'))
        swimlaneId = board.getDefaultSwimline()._id;


      card = {
        title,
        members,
        labelIds,
        customFields,
        listId: this.data()._id,
        boardId: board._id,
        sort: sortIndex,
        swimlaneId,
        dueAt,
        type: cardType,
        linkedId,
      };
      Lens.prepareNewCard(card);
      const _id = Cards.insert(card);
      // if the displayed card count is less than the total cards in the list,
      // we need to increment the displayed card count to prevent the spinner
      // to appear
      const cardCount = this.data().cards(this.idOrNull(swimlaneId)).count();
      if (this.cardlimit.get() < cardCount) {
        this.cardlimit.set(this.cardlimit.get() + InfiniteScrollIter);
      }
      // In case the filter is active we need to add the newly inserted card in
      // the list of exceptions -- cards that are not filtered. Otherwise the
      // card will disappear instantly.
      // See https://github.com/wekan/wekan/issues/80
      Filter.addException(_id);

      // We keep the form opened, empty it, and scroll to it.
      textarea.val('').focus();
      autosize.update(textarea);
      if (position === 'bottom') {
        this.scrollToBottom();
      }

      formComponent.reset();
    }
  },

  scrollToBottom() {
    const container = this.firstNode();
    $(container).animate({
      scrollTop: container.scrollHeight,
    });
  },

  // _singleClickOnMinicard(evt){
  //   //console.log(evt);
  //   if (this._isSingleClick) {
  //     this._isSingleClick = false;
  //     this.clickOnMiniCard(evt, this.currentData()._id, true);
  //   } else {
  //     this._isSingleClick = true;
  //     let id = this.currentData()._id;
  //     Meteor.setTimeout(()=>{
  //       if(this._isSingleClick){
  //         this._isSingleClick = false;
  //         this.clickOnMiniCard(evt, id, false);
  //       }
  //     }
  //     ,100);
  //   }
  // },
  // _dblclickOnMinicard(evt){
  //     // this._isSingleClick = false;
  //     // this.clickOnMiniCard(evt, this.currentData()._id, true);
  // },

  clickOnMiniCard(evt, id, isDblClick) {
    if (MultiSelection.isActive() || evt.shiftKey) {
      evt.stopImmediatePropagation();
      evt.preventDefault();
      const methodName = evt.shiftKey ? 'toggleRange' : 'toggle';
      MultiSelection[methodName](id);

      // If the card is already selected, we want to de-select it.
      // XXX We should probably modify the minicard href attribute instead of
      // overwriting the event in case the card is already selected.
    } else if (Session.equals('currentCard', id)) {
      evt.stopImmediatePropagation();
      evt.preventDefault();
      Utils.goBoardId(Session.get('currentBoard'));
    } else {
      evt.stopImmediatePropagation();
      evt.preventDefault();
      Utils.goCardId(id, isDblClick);

    }
  },

  cardIsSelected() {
    return Session.equals('currentCard', this.currentData()._id);
  },

  cardIsLastEdit() {
    if (!Features.opinions.highlightRecentCards) return false;
    if (this.cardIsSelected()) return false;

    const extra = Session.get('currentCardExtra');
    return extra && extra.id === this.currentData()._id;
  },

  toggleMultiSelection(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    MultiSelection.toggle(this.currentData()._id);
  },

  idOrNull(swimlaneId) {
    const currentUser = Meteor.user();
    if (currentUser.profile.boardView === 'board-view-swimlanes' ||
        this.data().board().isTemplatesBoard())
      return swimlaneId;
    return undefined;
  },

  cardsWithLimit(swimlaneId) {
    const limit = this.cardlimit.get();
    const selector = {
      listId: this.currentData()._id,
      archived: false,
    };
    if (swimlaneId)
      selector.swimlaneId = swimlaneId;
    return Cards.find(Filter.mongoSelector(selector), {
      sort: ['sort'],
      limit,
    });
  },

  spinnerInView(container) {
    const parentViewHeight = container.clientHeight;
    const bottomViewPosition = container.scrollTop + parentViewHeight;

    const spinner = this.find('.sk-spinner-list');

    const threshold = spinner.offsetTop;

    return bottomViewPosition > threshold;
  },

  showSpinner(swimlaneId) {
    const list = Template.currentData();
    return list.cards(swimlaneId).count() > this.cardlimit.get();
  },

  updateList(container) {
    // first, if the spinner is not rendered, we have reached the end of
    // the list of cards, so skip and disable firing the events
    const target = this.find('.sk-spinner-list');
    if (!target) {
      this.$(container).off('scroll');
      $(window).off(`resize.${this.data().listId}`);
      return;
    }

    if (this.spinnerInView(container)) {
      this.cardlimit.set(this.cardlimit.get() + InfiniteScrollIter);
      Ps.update(container);
    }
  },

  canSeeAddCard() {
    return !this.reachedWipLimit() && Meteor.user() && Meteor.user().isBoardMember() && !Meteor.user().isCommentOnly();
  },

  reachedWipLimit() {
    const list = Template.currentData();
    return !list.getWipLimit('soft') && list.getWipLimit('enabled') && list.getWipLimit('value') <= list.cards().count();
  },

  events() {
    return [{
      'click .js-minicard': evt => this.clickOnMiniCard(evt, this.currentData()._id, Features.opinions.editCardTitleByDefault),
      //'dblclick .js-minicard': this._dblclickOnMinicard,
      'click .js-toggle-multi-selection': this.toggleMultiSelection,
      'click .open-minicard-composer': this.scrollToBottom,
      submit: this.addCard,
    }];
  },
}).register('listBody');

function toggleValueInReactiveArray(reactiveValue, value) {
  const array = reactiveValue.get();
  const valueIndex = array.indexOf(value);
  if (valueIndex === -1) {
    array.push(value);
  } else {
    array.splice(valueIndex, 1);
  }
  reactiveValue.set(array);
}

BlazeComponent.extendComponent({
  onCreated() {
    this.labels = new ReactiveVar([]);
    this.members = new ReactiveVar([]);
    this.dueDate = new ReactiveVar();
    this.customFields = new ReactiveVar([]);

    const currentBoardId = Session.get('currentBoard');
    arr = [];
    _.forEach(Boards.findOne(currentBoardId).customFields().fetch(), function(field){
      if(field.automaticallyOnCard)
        arr.push({_id: field._id, value: null});
    });
    this.customFields.set(arr);
  },

  reset() {
    this.labels.set([]);
    this.members.set([]);
    this.dueDate.set();
    this.customFields.set([]);
  },

  getLabels() {
    const currentBoardId = Session.get('currentBoard');
    return Boards.findOne(currentBoardId).allLabels().filter((label) => {
      return this.labels.get().indexOf(label._id) > -1;
    });
  },

  showDueDate() {
    return moment(this.dueDate.get()).format(Features.opinions.dates.formats.date);
  },

  pressKey(evt) {
    // Pressing Enter should submit the card
    if (evt.keyCode === 13 && !evt.shiftKey) {
      evt.preventDefault();
      const $form = $(evt.currentTarget).closest('form');
      // XXX For some reason $form.submit() does not work (it's probably a bug
      // of blaze-component related to the fact that the submit event is non-
      // bubbling). This is why we click on the submit button instead -- which
      // work.
      $form.find('button[type=submit]').click();

      // Pressing Tab should open the form of the next column, and Maj+Tab go
      // in the reverse order
    } else if (evt.keyCode === 9) {
      evt.preventDefault();
      const isReverse = evt.shiftKey;
      const list = $(`#js-list-${this.data().listId}`);
      const listSelector = '.js-list:not(.js-list-composer)';
      let nextList = list[isReverse ? 'prev' : 'next'](listSelector).get(0);
      // If there is no next list, loop back to the beginning.
      if (!nextList) {
        nextList = $(listSelector + (isReverse ? ':last' : ':first')).get(0);
      }

      BlazeComponent.getComponentForElement(nextList).openForm({
        position:this.data().position,
      });
    }
  },

  events() {
    return [{
      keydown: this.pressKey,
      'click .js-link': Popup.open('linkCard'),
      'click .js-search': Popup.open('searchElement'),
      'click .js-card-template': Popup.open('searchElement'),
    }];
  },

  onRendered() {
    const editor = this;
    const $textarea = this.$('textarea');

    autosize($textarea);

    CardAutocompletion.autocomplete($textarea, {
      user: user=> {
        toggleValueInReactiveArray(editor.members, user._id);
        return '';
      },
      label: label => {
        toggleValueInReactiveArray(editor.labels, label._id);
        return '';
      },
      date: due => {
        editor.dueDate.set(due);
        return '';
      }

    });
  },
}).register('addCardForm');

BlazeComponent.extendComponent({
  onCreated() {
    this.selectedBoardId = new ReactiveVar('');
    this.selectedSwimlaneId = new ReactiveVar('');
    this.selectedListId = new ReactiveVar('');

    this.boardId = Session.get('currentBoard');
    // In order to get current board info
    subManager.subscribe('board', this.boardId);
    this.board = Boards.findOne(this.boardId);
    // List where to insert card
    const list = $(Popup._getTopStack().openerElement).closest('.js-list');
    this.listId = Blaze.getData(list[0])._id;
    // Swimlane where to insert card
    const swimlane = $(Popup._getTopStack().openerElement).closest('.js-swimlane');
    this.swimlaneId = '';
    const boardView = Meteor.user().profile.boardView;
    if (boardView === 'board-view-swimlanes')
      this.swimlaneId = Blaze.getData(swimlane[0])._id;
    else if (boardView === 'board-view-lists')
      this.swimlaneId = Swimlanes.findOne({boardId: this.boardId})._id;
  },

  boards() {
    const boards = Boards.find({
      archived: false,
      'members.userId': Meteor.userId(),
      _id: {$ne: Session.get('currentBoard')},
      type: 'board',
    }, {
      sort: ['title'],
    });
    return boards;
  },

  swimlanes() {
    if (!this.selectedBoardId.get()) {
      return [];
    }
    const swimlanes = Swimlanes.find({boardId: this.selectedBoardId.get()});
    if (swimlanes.count())
      this.selectedSwimlaneId.set(swimlanes.fetch()[0]._id);
    return swimlanes;
  },

  lists() {
    if (!this.selectedBoardId.get()) {
      return [];
    }
    const lists = Lists.find({boardId: this.selectedBoardId.get()});
    if (lists.count())
      this.selectedListId.set(lists.fetch()[0]._id);
    return lists;
  },

  cards() {
    if (!this.board) {
      return [];
    }
    const ownCardsIds = this.board.cards().map((card) => { return card.linkedId || card._id; });
    return Cards.find({
      boardId: this.selectedBoardId.get(),
      swimlaneId: this.selectedSwimlaneId.get(),
      listId: this.selectedListId.get(),
      archived: false,
      linkedId: {$nin: ownCardsIds},
      _id: {$nin: ownCardsIds},
      type: {$nin: ['template-card']},
    });
  },

  events() {
    return [{
      'change .js-select-boards'(evt) {
        subManager.subscribe('board', $(evt.currentTarget).val());
        this.selectedBoardId.set($(evt.currentTarget).val());
      },
      'change .js-select-swimlanes'(evt) {
        this.selectedSwimlaneId.set($(evt.currentTarget).val());
      },
      'change .js-select-lists'(evt) {
        this.selectedListId.set($(evt.currentTarget).val());
      },
      'click .js-done' (evt) {
        // LINK CARD
        evt.stopPropagation();
        evt.preventDefault();
        const linkedId = $('.js-select-cards option:selected').val();
        if (!linkedId) {
          Popup.close();
          return;
        }
        const _id = Cards.insert({
          title: $('.js-select-cards option:selected').text(), //dummy
          listId: this.listId,
          swimlaneId: this.swimlaneId,
          boardId: this.boardId,
          sort: Lists.findOne(this.listId).cards().count(),
          type: 'cardType-linkedCard',
          linkedId,
        });
        Filter.addException(_id);
        Popup.close();
      },
      'click .js-link-board' (evt) {
        //LINK BOARD
        evt.stopPropagation();
        evt.preventDefault();
        const impBoardId = $('.js-select-boards option:selected').val();
        if (!impBoardId || Cards.findOne({linkedId: impBoardId, archived: false})) {
          Popup.close();
          return;
        }
        const _id = Cards.insert({
          title: $('.js-select-boards option:selected').text(), //dummy
          listId: this.listId,
          swimlaneId: this.swimlaneId,
          boardId: this.boardId,
          sort: Lists.findOne(this.listId).cards().count(),
          type: 'cardType-linkedBoard',
          linkedId: impBoardId,
        });
        Filter.addException(_id);
        Popup.close();
      },
    }];
  },
}).register('linkCardPopup');

BlazeComponent.extendComponent({
  mixins() {
    return [Mixins.PerfectScrollbar];
  },

  onCreated() {
    this.isCardTemplateSearch = $(Popup._getTopStack().openerElement).hasClass('js-card-template');
    this.isListTemplateSearch = $(Popup._getTopStack().openerElement).hasClass('js-list-template');
    this.isSwimlaneTemplateSearch = $(Popup._getTopStack().openerElement).hasClass('js-open-add-swimlane-menu');
    this.isBoardTemplateSearch = $(Popup._getTopStack().openerElement).hasClass('js-add-board');
    this.isTemplateSearch = this.isCardTemplateSearch ||
      this.isListTemplateSearch ||
      this.isSwimlaneTemplateSearch ||
      this.isBoardTemplateSearch;
    let board = {};
    if (this.isTemplateSearch) {
      board = Boards.findOne(Meteor.user().profile.templatesBoardId);
    } else {
      // Prefetch first non-current board id
      board = Boards.findOne({
        archived: false,
        'members.userId': Meteor.userId(),
        _id: {$nin: [Session.get('currentBoard'), Meteor.user().profile.templatesBoardId]},
      });
    }
    if (!board) {
      Popup.close();
      return;
    }
    const boardId = board._id;
    // Subscribe to this board
    subManager.subscribe('board', boardId);
    this.selectedBoardId = new ReactiveVar(boardId);

    if (!this.isBoardTemplateSearch) {
      this.boardId = Session.get('currentBoard');
      // In order to get current board info
      subManager.subscribe('board', this.boardId);
      this.swimlaneId = '';
      // Swimlane where to insert card
      const swimlane = $(Popup._getTopStack().openerElement).parents('.js-swimlane');
      if (Meteor.user().profile.boardView === 'board-view-swimlanes')
        this.swimlaneId = Blaze.getData(swimlane[0])._id;
      else
        this.swimlaneId = Swimlanes.findOne({boardId: this.boardId})._id;
      // List where to insert card
      const list = $(Popup._getTopStack().openerElement).closest('.js-list');
      this.listId = Blaze.getData(list[0])._id;
    }
    this.term = new ReactiveVar('');
  },

  boards() {
    const boards = Boards.find({
      archived: false,
      'members.userId': Meteor.userId(),
      _id: {$ne: Session.get('currentBoard')},
      type: 'board',
    }, {
      sort: ['title'],
    });
    return boards;
  },

  results() {
    if (!this.selectedBoardId) {
      return [];
    }
    const board = Boards.findOne(this.selectedBoardId.get());
    if (!this.isTemplateSearch || this.isCardTemplateSearch) {
      return board.searchCards(this.term.get(), false);
    } else if (this.isListTemplateSearch) {
      return board.searchLists(this.term.get());
    } else if (this.isSwimlaneTemplateSearch) {
      return board.searchSwimlanes(this.term.get());
    } else if (this.isBoardTemplateSearch) {
      const boards = board.searchBoards(this.term.get());
      boards.forEach((board) => {
        subManager.subscribe('board', board.linkedId);
      });
      return boards;
    } else {
      return [];
    }
  },

  events() {
    return [{
      'change .js-select-boards'(evt) {
        subManager.subscribe('board', $(evt.currentTarget).val());
        this.selectedBoardId.set($(evt.currentTarget).val());
      },
      'submit .js-search-term-form'(evt) {
        evt.preventDefault();
        this.term.set(evt.target.searchTerm.value);
      },
      'click .js-minicard'(evt) {
        // 0. Common
        const title = $('.js-element-title').val().trim();
        if (!title)
          return;
        const element = Blaze.getData(evt.currentTarget);
        element.title = title;
        let _id = '';
        if (!this.isTemplateSearch || this.isCardTemplateSearch) {
          // Card insertion
          // 1. Common
          element.sort = Lists.findOne(this.listId).cards().count();
          // 1.A From template
          if (this.isTemplateSearch) {
            element.type = 'cardType-card';
            element.linkedId = '';
            _id = element.copy(this.boardId, this.swimlaneId, this.listId);
            // 1.B Linked card
          } else {
            delete element._id;
            element.type = 'cardType-linkedCard';
            element.linkedId = element.linkedId || element._id;
            _id = Cards.insert(element);
          }
          Filter.addException(_id);
          // List insertion
        } else if (this.isListTemplateSearch) {
          element.sort = Swimlanes.findOne(this.swimlaneId).lists().count();
          element.type = 'list';
          _id = element.copy(this.boardId, this.swimlaneId);
        } else if (this.isSwimlaneTemplateSearch) {
          element.sort = Boards.findOne(this.boardId).swimlanes().count();
          element.type = 'swimlalne';
          _id = element.copy(this.boardId);
        } else if (this.isBoardTemplateSearch) {
          board = Boards.findOne(element.linkedId);
          board.sort = Boards.find({archived: false}).count();
          board.type = 'board';
          board.title = element.title;
          delete board.slug;
          _id = board.copy();
        }
        Popup.close();
      },
    }];
  },
}).register('searchElementPopup');
