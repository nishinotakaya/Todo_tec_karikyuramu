import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { fetchTodos, createTodo, updateTodo, deleteTodo } from './api';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import Filter from './components/Filter';
import DOMPurify from 'dompurify';
import MarkdownRenderer from './components/MarkdownRenderer';
import { Todo } from './types'; // types.tsのパスに応じて調整

type Filter = 'all' | 'completed' | 'unchecked' | 'delete';

const Task: React.FC = () => {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showSubContent, setShowSubContent] = useState<number | null>(null);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [modalContent, setModalContent] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState<Date>(date ? new Date(date) : new Date()); // 日付の状態を管理

   // 日付が変更されたときにAPIからタスクを取得するuseEffect
   useEffect(() => {
    const fetchTodosByDate = async () => {
      try {
        const formattedDate = currentDate.toISOString().split('T')[0]; // 日付をフォーマット
        const response = await fetch(`http://localhost:3001/api/v1/todos?output_date=${formattedDate}`);
        if (!response.ok) {
          throw new Error('Failed to fetch todos');
        }
        const data = await response.json();
        setTodos(data); // API レスポンスからタスクを設定
      } catch (error) {
        console.error("Error fetching todos:", error);
      }
    };

    fetchTodosByDate(); // API 呼び出し
  }, [currentDate]); // currentDate が変更されたときに API を再呼び出し

  const handleDateChange = (days: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days); // 日付を変更
    setCurrentDate(newDate); // 日付を状態として保存
    navigate(`/todos/${newDate.toISOString().split('T')[0]}`); // 新しい日付をURLに反映
  };

  const handleSubmit = () => {
    if (!text) return;

    const defaultSubContent = `
## 進捗状況
## 内容
## 背景
## 改修点`;

    const newTodo: Omit<Todo, 'id'> = {
      content: text, // 入力された内容をcontentにセット
      completed: false,
      delete_flg: false,
      sort: todos.length + 1,
      output_date: date || '',
      sub_content: defaultSubContent, // デフォルトのsub_contentを設定
      copy_id: Math.floor(Math.random() * 1000000), // コピーIDを生成
      progress_rate: 0, // 初期値として0%を設定
      start_date: date || '', // 新しい開始日
      completion_date: date || '', // 新しい完了予定日
      completion_date_actual: '', // 完了日
    };

    // 同じ copy_id と output_date のタスクが存在するかチェック
    const existingTodo = todos.find(todo => todo.copy_id === newTodo.copy_id && todo.output_date === newTodo.output_date);

    if (existingTodo) {
      console.log('同じcopy_idとoutput_dateのタスクがすでに存在します。');
      return; // 同じものがあれば作成しない
    }

    createTodo(newTodo).then(data => {
      setTodos(prevTodos => [...prevTodos, data]);
      setText('');
    });
  };


  const getFilteredTodos = () => {
    let filteredTodos = [];
    switch (filter) {
      case 'completed':
        filteredTodos = todos.filter(todo => todo.completed && !todo.delete_flg && todo.output_date === date);
        break;
      case 'unchecked':
        filteredTodos = todos.filter(todo => !todo.completed && !todo.delete_flg && todo.output_date === date);
        break;
      case 'delete':
        filteredTodos = todos.filter(todo => todo.delete_flg && todo.output_date === date);
        break;
      default:
        filteredTodos = todos.filter(todo => !todo.delete_flg && todo.output_date === date);
        break;
    }
    return filteredTodos.sort((a, b) => a.sort - b.sort);
  };

  const handleTodo = <K extends keyof Todo, V extends Todo[K]>(
    id: number,
    key: K,
    value: V
  ) => {
    const todo = todos.find(todo => todo.id === id);
    if (!todo) return;

    const updatedTodos = todos.map(t =>
      t.id === id ? { ...t, [key]: value } : t
    );
    setTodos(updatedTodos);

    if (key === 'start_date' || key === 'completion_date') {
      const startDate = new Date(key === 'start_date' ? value as string : todo.start_date);
      const newCompletionDate = new Date(key === 'completion_date' ? value as string : todo.completion_date);
      const oldCompletionDate = new Date(todo.completion_date);
      const daysBetween = Math.floor((newCompletionDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24));

      // `copy_id` がnullの場合、新しい `copy_id` を生成
      const copyId = todo.copy_id || Math.floor(Math.random() * 1000000); // `copy_id` が null なら新しく生成

      // 完了予定日を短縮した場合、予定日から外れたものに `delete_flg` を立てる
      if (newCompletionDate < oldCompletionDate) {
        const daysToFlag = Math.floor((oldCompletionDate.getTime() - newCompletionDate.getTime()) / (1000 * 3600 * 24));
        for (let i = 1; i <= daysToFlag; i++) {
          const dateToFlag = new Date(newCompletionDate);
          dateToFlag.setDate(dateToFlag.getDate() + i);
          const todoToFlag = todos.find(t => t.copy_id === copyId && t.output_date === dateToFlag.toISOString().split('T')[0]);
          if (todoToFlag) {
            updateTodo(todoToFlag.id, { ...todoToFlag, delete_flg: true }).then(() => {
              setTodos(prevTodos => prevTodos.map(t => t.id === todoToFlag.id ? { ...t, delete_flg: true } : t));
            });
          }
        }
      }

      // 開始日から完了予定日の間のタスクを更新または新規作成
      for (let i = 0; i <= daysBetween; i++) {
        const newDate = new Date(startDate);
        newDate.setDate(newDate.getDate() + i);

        const existingTodo = todos.find(t => t.copy_id === copyId && t.output_date === newDate.toISOString().split('T')[0]);

        if (!existingTodo) {
          const newTodo: Omit<Todo, 'id'> = {
            content: todo.content,
            completed: todo.completed,
            delete_flg: false,
            sort: todo.sort + 1,
            output_date: newDate.toISOString().split('T')[0],
            sub_content: todo.sub_content,
            progress_rate: todo.progress_rate,
            start_date: startDate.toISOString().split('T')[0],
            completion_date: newCompletionDate.toISOString().split('T')[0],
            completion_date_actual: todo.completion_date_actual,
            copy_id: copyId, // 一意のコピーIDを設定
          };

          createTodo(newTodo).then(createdTodo => {
            setTodos(prevTodos => [...prevTodos, createdTodo]);
          });
        } else if (existingTodo.delete_flg) {
          // 既存のタスクの `delete_flg` を解除して更新
          updateTodo(existingTodo.id, { ...existingTodo, delete_flg: false, completion_date: newCompletionDate.toISOString().split('T')[0] }).then(() => {
            setTodos(prevTodos =>
              prevTodos.map(t => t.id === existingTodo.id ? { ...t, delete_flg: false, completion_date: newCompletionDate.toISOString().split('T')[0] } : t)
            );
          });
        } else {
          // 既存のタスクを更新
          updateTodo(existingTodo.id, { ...existingTodo, completion_date: newCompletionDate.toISOString().split('T')[0] }).then(() => {
            setTodos(prevTodos =>
              prevTodos.map(t => t.id === existingTodo.id ? { ...t, completion_date: newCompletionDate.toISOString().split('T')[0] } : t)
            );
          });
        }
      }

      // 元のタスクも更新
      updateTodo(id, { ...todo, [key]: value, copy_id: copyId });
    } else {
      // その他のフィールドが変更された場合の処理
      updateTodo(id, { ...todo, [key]: value });
    }
  };

  const handleEmpty = () => {
    const filteredTodos = todos.filter(todo => !todo.delete_flg);
    const deletePromises = todos
      .filter(todo => todo.delete_flg)
      .map(todo => deleteTodo(todo.id));

    Promise.all(deletePromises).then(() => {
      setTodos(filteredTodos.map((todo, index) => ({ ...todo, sort: index + 1 })));
      filteredTodos.forEach((todo, index) => updateTodo(todo.id, { ...todo, sort: index + 1 }));
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const filteredTodos = getFilteredTodos();
    const [movedTodo] = filteredTodos.splice(result.source.index, 1);
    filteredTodos.splice(result.destination.index, 0, movedTodo);

    filteredTodos.forEach((todo, index) => {
      todo.sort = index + 1;
      updateTodo(todo.id, todo);
    });

    setTodos(prevTodos => prevTodos.map(todo => filteredTodos.find(ft => ft.id === todo.id) || todo));
  };

  const toggleSubContent = (id: number) => {
    setShowSubContent(prevId => (prevId === id ? null : id));
  };

  const handleBackToCalendar = () => {
    navigate('/');
  };

  const outputDate = date;
  // output_dateがURLの日付に一致するタスクだけを絞り込む
  const filteredTodosForExcel = todos.filter(todo => todo.output_date === outputDate && !todo.delete_flg);

  // Function to export the data to Excel
  const exportToExcel = () => {
    const wsData = [
      ['', 'タイトル', '開始日', '完了予定日', '完了日', '進捗率', '内容'], // Title row
    ];
    console.log(filteredTodosForExcel);
    filteredTodosForExcel.forEach((todo) => {
      wsData.push([
        '',
        todo.content,
        todo.start_date,
        todo.completion_date,
        todo.completed ? todo.output_date : '', // Actual completion date if completed
        `${todo.progress_rate}%`,
        todo.sub_content || '',
      ]);
    });

    // エクセル作成
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'WBS');

    // Create WBS graph columns
    const wbsGraphColumns = ['G', 'H', 'I', 'J', 'K']; // Sample columns, adjust as needed
    wbsGraphColumns.forEach((col, index) => {
      ws[`${col}1`] = { t: 's', v: `Week ${index + 1}` }; // Title for WBS graph columns

      filteredTodosForExcel.forEach((todo, rowIndex) => {
        const startDate = new Date(todo.start_date);
        const completionDate = new Date(todo.completion_date);

        // Adjust the date range as needed, below is a simple example
        const weekStart = new Date(2024, 0, index * 7 + 1); // Assuming starting from Jan 1, 2024
        const weekEnd = new Date(2024, 0, index * 7 + 7);

        // Calculate if this week falls within the start and completion dates
        if (startDate <= weekEnd && completionDate >= weekStart) {
          ws[`${col}${rowIndex + 2}`] = { t: 's', v: '■' };
        }
      });
    });

    // Generate Excel file and trigger download
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    saveAs(blob, `wbs_output_${outputDate}.xlsx`);
  };

  const handleProgressChange = (id: number, newProgress: number) => {
    setTodos(prevTodos =>
      prevTodos.map(todo =>
        todo.id === id
          ? { ...todo, progress_rate: newProgress, completed: newProgress === 100 }
          : todo
      )
    );

    const updatedTodo = todos.find(todo => todo.id === id);
    if (updatedTodo) {
      updateTodo(id, { ...updatedTodo, progress_rate: newProgress, completed: newProgress === 100 });
    }
  };

  // マークダウン形式のリンクを<a>タグに変換する関数
  const parseMarkdownLinks = (content: string) => {
    // [タイトル](URL) の形式を検出する正規表現
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g; // [タイトル](URL) の形式を検出
    const sanitizedContent = content.replace(linkRegex, (match, text, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });
    return DOMPurify.sanitize(sanitizedContent); // XSS対策としてサニタイズ
  };

  // リンクのクリックイベントを処理する関数
  const handleMarkdownLinkClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const link = e.target as HTMLAnchorElement;
    if (link.tagName === 'A' && link.href) {
      window.open(link.href, '_blank', 'noopener,noreferrer');
      e.preventDefault(); // 標準のリンク動作をキャンセル
    }
  };

  const closeModal = () => {
    setModalIsOpen(false);
    setModalContent(null);
  };

  const openModal = (content: string) => {
    setModalContent(content);
    setModalIsOpen(true);
  };

  return (
    <div>
      <h1>{date && new Date(date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}</h1>
       {/* 日付移動とカレンダーのボタン */}
       <button className="date-nav-button" onClick={() => handleDateChange(-1)}>前の日</button>
      <button className="back-to-calendar-button" onClick={handleBackToCalendar}>カレンダーに戻る</button>
      <button className="date-nav-button" onClick={() => handleDateChange(1)}>次の日</button>
      <Filter filter={filter} onChange={setFilter} />
      <button onClick={exportToExcel} style={{ marginBottom: '20px' }}>エクセルに出力</button>
      {filter === 'delete' ? (
        <button onClick={handleEmpty}>ごみ箱を空にする</button>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit">追加</button>
          </form>
        </>
      )}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="todos">
          {(provided) => (
            <ul
              {...provided.droppableProps}
              ref={provided.innerRef}
            >
              {getFilteredTodos().map((todo, index) => (
                <Draggable key={todo.id} draggableId={todo.id.toString()} index={index}>
                  {(provided) => (
                    <li
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className="task-item"
                    >
                      <div className="input-container">
                        <div className="div-container">
                          <label htmlFor={`progress-rate-${todo.id}`} style={{ fontSize: '12px' }}>進捗率</label>
                          <select
                            value={todo.progress_rate || 0}
                            onChange={(e) => handleProgressChange(todo.id, Number(e.target.value))}
                            disabled={todo.delete_flg}
                            style={{ fontSize: '14px', width: '79px', marginBottom: '17px', marginTop: '-0.5px' }}
                          >
                            {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(rate => (
                              <option key={rate} value={rate}>{rate}%</option>
                            ))}
                          </select>
                        </div>
                        <div className="div-container">
                          <label htmlFor={`start-date-${todo.id}`} style={{ fontSize: '12px' }}>開始日</label>
                          <input
                            type="date"
                            id={`start-date-${todo.id}`}
                            value={todo.start_date}
                            onChange={(e) => handleTodo(todo.id, 'start_date', e.target.value)}
                            min={todo.output_date} // 開始日がoutput_dateより前に設定できないようにする
                          />
                          <label htmlFor={`completion-date-${todo.id}`} style={{ fontSize: '12px' }}>完了予定日</label>
                          <input
                            type="date"
                            id={`completion-date-${todo.id}`}
                            value={todo.completion_date}
                            onChange={(e) => handleTodo(todo.id, 'completion_date', e.target.value)}
                            min={todo.start_date || todo.output_date} // 完了予定日が開始日またはoutput_dateより前に設定できないようにする
                            style={{ marginBottom: '12px' }}
                          />
                        </div>
                        <div className="input-content">
                          {/* 入力内容を解析してリンクに変換し、リンクのタイトルを表示 */}
                          {(todo.content.includes('[') && todo.content.includes('](')) ||
                            parseMarkdownLinks(todo.content).includes('<a') ? (
                            <div
                              className="task-content"
                              dangerouslySetInnerHTML={{ __html: parseMarkdownLinks(todo.content) }}
                              onClick={handleMarkdownLinkClick}
                              style={{ marginLeft: '5px', fontSize: '19.5px', color: '#555', marginTop: '5px' }}
                            />
                          ) : null}
                          {/* ユーザーがテキストを入力するフィールド */}
                          <input
                            type="text"
                            disabled={todo.completed || todo.delete_flg}
                            value={todo.content}
                            onChange={(e) => handleTodo(todo.id, 'content', e.target.value)}
                            className="task-input"
                            style={{
                              width: '98%',
                              backgroundColor: todo.completed && todo.progress_rate === 100 ? '#d3d3d3' : '',
                              color: todo.completed && todo.progress_rate === 100 ? '#808080' : '',
                            }}
                          />
                        </div>
                        <button className="toggle-button" onClick={() => toggleSubContent(todo.id)}>
                          編集
                        </button>
                        <button className="delete-button" onClick={() => handleTodo(todo.id, 'delete_flg', !todo.delete_flg)}>
                          {todo.delete_flg ? '復元' : '削除'}
                        </button>
                      </div>
                      {showSubContent === todo.id && (
                        <textarea
                          value={todo.sub_content || ''}
                          onChange={(e) => handleTodo(todo.id, 'sub_content', e.target.value)}
                          style={{ fontSize: '16px', width: '100%', height: '100px', marginTop: '10px' }}
                        />
                      )}
                      {/* マークダウン表示ボタン */}
                      {todo.sub_content && (
                        <button className="markdown-button" onClick={() => openModal(todo.sub_content ?? '')}>
                          マークダウン表示
                        </button>
                      )}
                    </li>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </ul>
          )}
        </Droppable>
      </DragDropContext>

      {/* モーダル部分 */}
      <MarkdownRenderer
          content={modalContent}
          isOpen={modalIsOpen}
          closeModal={closeModal}
          todos={todos}
          toggleSubContent={toggleSubContent} // toggleSubContent を渡す
        />
    </div>
  );
};

export default Task;
