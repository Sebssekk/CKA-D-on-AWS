for x in $(seq 1 $ACCESS_NUM)
    do
    sudo su user$x -c "cd /home/user$x && PASSWORD=$ACCESS_PSW nohup code-server --auth password --bind-addr 0.0.0.0:$((8080+$x)) &";
    echo "user$x CODE-SERVER RUNNING";
done

exit