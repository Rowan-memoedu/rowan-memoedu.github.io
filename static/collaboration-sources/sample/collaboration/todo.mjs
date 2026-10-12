export const nextTodoState = state => state === 'Unfinished' ? 'Finished' : state === 'Finished' ? null : 'Unfinished';
export const checkedTodoState = checked => checked ? 'Finished' : 'Unfinished';
