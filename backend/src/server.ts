import express from "express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import { SocketEvent, SocketId } from "./types/socket";
import { USER_CONNECTION_STATUS, User } from "./types/User";
import { Server } from "socket.io";

dotenv.config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
});

let userSocketMap: User[] = [];

function getUserInRoomById(roomId: string): User[] {
  return userSocketMap.filter((user) => user.roomId === roomId);
}

function getRoomIdUsingSocketId(socketId: SocketId): string {
  const roomId = userSocketMap.find(
    (user) => user.socketId === socketId
  )?.roomId;
  if (!roomId) {
    throw new Error("Room not found");
  }
  return roomId;
}

function getUserBySocketId(socketId: string): User {
  const user = userSocketMap.find((user) => user.socketId === socketId);
  if (!user) {
    throw new Error("User not found");
  }
  return user;
}

io.on("connection", (socket) => {
  socket.on(SocketEvent.JOIN_REQUEST, (roomId: string, username: string) => {
    const isUsernameExists =
      getUserInRoomById(roomId).filter((u) => u.username === username).length >
      0;
    if (isUsernameExists) {
      socket.emit(SocketEvent.USERNAME_EXISTS);
      return;
    }

    const user: User = {
      username,
      roomId,
      status: USER_CONNECTION_STATUS.ONLINE,
      cursorPosition: 0,
      typing: false,
      currentFile: null,
      socketId: socket.id,
    };
    userSocketMap.push(user);
    socket.join(roomId);
    socket.broadcast.to(roomId).emit(SocketEvent.USER_JOINED, { user });
    const users = getUserInRoomById(roomId);
    io.to(socket.id).emit(SocketEvent.JOIN_ACCEPTED, { user, users });
  });

  socket.on("disconnection", () => {
    const user = getUserBySocketId(socket.id);
    user.status = USER_CONNECTION_STATUS.OFFLINE;
    socket.broadcast
      .to(user.roomId)
      .emit(SocketEvent.USER_DISCONNECTED, { user });
    userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id);
    socket.leave(user.roomId);
  });

  socket.on(
    SocketEvent.SYNC_FILE_STRUCTURE,
    ({ fileStructure, openFiles, activeFile, socketId }) => {
      io.to(socketId).emit(SocketEvent.SYNC_FILE_STRUCTURE, {
        fileStructure,
        openFiles,
        activeFile,
      });
    }
  );

  socket.on(
    SocketEvent.DIRECTORY_CREATED,
    ({ parentDirectoryId, newDirectory }) => {
      const roomId = getRoomIdUsingSocketId(socket.id);
      socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_CREATED, {
        parentDirectoryId,
        newDirectory,
      });
    }
  );

  socket.on(SocketEvent.DIRECTORY_UPDATED, ({ directoryId, children }) => {
    const roomId = getRoomIdUsingSocketId(socket.id);
    socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_UPDATED, {
      directoryId,
      children,
    });
  });
  socket.on(
    SocketEvent.DIRECTORY_RENAMED,
    ({ directoryId, newDirectoryName }) => {
      const roomId = getRoomIdUsingSocketId(socket.id);
      socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_RENAMED, {
        directoryId,
        newDirectoryName,
      });
    }
  );

  socket.on(SocketEvent.DIRECTORY_DELETED, ({ directoryId }) => {
    const roomId = getRoomIdUsingSocketId(socket.id);
    socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_DELETED, {
      directoryId,
    });
  });

  socket.on(SocketEvent.FILE_CREATED, ({ parentDirectoryId, newFile }) => {
    const roomId = getRoomIdUsingSocketId(socket.id);
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_CREATED, {
      parentDirectoryId,
      newFile,
    });
  });

  socket.on(SocketEvent.FILE_UPDATED, ({ fileId, content }) => {
    const roomId = getRoomIdUsingSocketId(socket.id);
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_UPDATED, {
      fileId,
      content,
    });
  });

  socket.on(SocketEvent.FILE_RENAMED, ({ fileId, newFileName }) => {
    const roomId = getRoomIdUsingSocketId(socket.id);
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_RENAMED, {
      fileId,
      newFileName,
    });
  });

  socket.on(SocketEvent.FILE_DELETED, ({ fileId }) => {
    const roomId = getRoomIdUsingSocketId(socket.id);
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_DELETED, {
      fileId,
    });
  });

  socket.on(SocketEvent.USER_OFFLINE, ({ socketId }) => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socketId) {
        return { ...user, status: USER_CONNECTION_STATUS.OFFLINE };
      }
      return user;
    });
    const roomId = getRoomIdUsingSocketId(socketId);

    socket.broadcast.to(roomId).emit(SocketEvent.USER_OFFLINE, { socketId });
  });

  socket.on(SocketEvent.USER_ONLINE, ({ socketId }) => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socketId) {
        return { ...user, status: USER_CONNECTION_STATUS.ONLINE };
      }
      return user;
    });
    const roomId = getRoomIdUsingSocketId(socketId);

    socket.broadcast.to(roomId).emit(SocketEvent.USER_ONLINE, { socketId });
  });

  socket.on(SocketEvent.SEND_MESSAGE, ({ message, socketId }) => {
    const user = getUserBySocketId(socketId);
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.RECEIVE_MESSAGE, {
      message,
      user,
    });
  });

  socket.on(SocketEvent.TYPING_START, ({ cursorPosition }) => {
    const user = getUserBySocketId(socket.id);
    user.cursorPosition = cursorPosition;
    user.typing = true;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.TYPING_START, { user });
  });

  socket.on(SocketEvent.TYPING_PAUSE, () => {
    const user = getUserBySocketId(socket.id);
    user.typing = false;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.TYPING_PAUSE, { user });
  });

  socket.on(SocketEvent.REQUEST_DRAWING, ({ socketId }) => {
    const user = getUserBySocketId(socketId);
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.REQUEST_DRAWING, { socketId });
  });

  socket.on(SocketEvent.SYNC_DRAWING, ({ drawing, socketId }) => {
    const user = getUserBySocketId(socketId);
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.SYNC_DRAWING, { drawing });
  });

  socket.on(SocketEvent.DRAWING_UPDATE, ({ drawing, socketId }) => {
    const user = getUserBySocketId(socketId);
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.DRAWING_UPDATE, { drawing });
  });

  socket.on(
    SocketEvent.CODE_HIGHLIGHTING,
    ({ fileId, socketId, highlight }) => {
      const user = getUserBySocketId(socketId);
      const roomId = user.roomId;
      socket.broadcast
        .to(roomId)
        .emit(SocketEvent.CODE_HIGHLIGHTING, { fileId, highlight });
    }
  );
});

const PORT = process.env.PORT;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
